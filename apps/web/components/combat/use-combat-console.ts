"use client"

import { useRouter } from "next/navigation"
import { useEffect, useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import { type PcCombatantDetail } from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"

import { parseCharacterPing } from "@/hooks/character-version-sync"
import { parseEncounterPing } from "@/hooks/encounter-ping"
import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { useQueuedWrite } from "@/hooks/use-queued-write"
import { useRealtimeChannel } from "@/hooks/use-realtime-channel"
import { endEncounterAction } from "@/lib/actions/encounter/end"
import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { applyCombatEvent } from "@/lib/actions/encounter/events"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { reduceCombatSession } from "@/lib/game-engine"

import { decidePcPing } from "./pc-ping"

/**
 * The live DM console's owner-mode write surface (UNN-344) — the encounter
 * analog of `useInventoryEditor`. It mirrors the **same** `reduceCombatSession`
 * the server runs optimistically (`useOptimistic`), so the frame the DM sees is
 * structurally identical to what `applyCombatEvent` will persist; on success it
 * `router.refresh()`es to reconcile the real session (and any PC HP the page
 * re-reads), and on failure the toast fires while React reverts the optimistic
 * state automatically (ADR Decision 4; the optimistic-toggle pattern in
 * `lib/actions/README.md`).
 *
 * Writes go through the shared {@link useQueuedWrite} primitive (UNN-378): it
 * owns the encounter `version` in a monotonic ref, **serializes** back-to-back
 * dispatches (each reads the freshly-bumped token its predecessor produced, so a
 * rapid draft → end-turn isn't spuriously rejected as `stale`), and on a genuine
 * cross-writer `stale` refetches the live version and retries the event once
 * (the Server Action re-reduces onto the current session, so the retry is safe).
 *
 * **Realtime (UNN-373):** the hook also subscribes to the encounter's ping
 * channel and owns the per-PC `vitalsVersion` map the character-channel
 * listeners (mounted by the console root) and the drawer's pools writes share.
 * The encounter-ping handler only **schedules a refresh** — it never forwards
 * its version into the write ref. Forwarding it (the old bug, UNN-378) greenlit
 * an absolute-payload event at a version the client hadn't actually loaded yet,
 * silently clobbering the change that ping represented. The write ref now tracks
 * only the *loaded* prop (advanced by the hook's own writes + the monotonic
 * prop-sync after a refresh), so a stale event is correctly rejected and retried.
 * Refreshes are microtask-deduped: pings that land in the same event-loop task
 * (and a handler's own re-entrancy) collapse into one `router.refresh()`. Pings
 * arriving in separate tasks — e.g. an AoE's per-PC pings delivered as separate
 * WebSocket messages — may each refresh; that's accepted (each refresh is a
 * cheap re-read), with a wider debounce window as the known lever if it ever
 * shows up as churn in practice.
 */
export function useCombatConsole(
  encounter: Pick<EncounterRow, "id" | "shortId" | "session" | "version">,
  pcDetailById: Record<string, PcCombatantDetail>
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [session, applyOptimistic] = useOptimistic(
    encounter.session,
    (current, event: CombatEvent) => reduceCombatSession(current, event)
  )

  const { versionRef, enqueue } = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })

  /**
   * The tracked `vitalsVersion` per PC combatant — written by the drawer's
   * pools writes and the ping compare, forward-only synced from the hydrated
   * props (versions are monotonic, so `max` semantics can't regress a token
   * the drawer already bumped ahead of an in-flight refresh).
   */
  const pcVitalsVersions = useRef<Record<string, number>>({})
  useEffect(() => {
    for (const detail of Object.values(pcDetailById)) {
      const known = pcVitalsVersions.current[detail.id]
      if (known === undefined || detail.vitalsVersion > known) {
        pcVitalsVersions.current[detail.id] = detail.vitalsVersion
      }
    }
  }, [pcDetailById])

  const refreshScheduled = useRef(false)
  function scheduleRefresh() {
    if (refreshScheduled.current) return
    refreshScheduled.current = true
    queueMicrotask(() => {
      refreshScheduled.current = false
      router.refresh()
    })
  }

  useRealtimeChannel({
    domain: "encounter",
    shortId: encounter.shortId,
    onPing: (data) => {
      const ping = parseEncounterPing(data)
      if (ping?.version === undefined) return
      if (ping.version <= versionRef.current) return
      scheduleRefresh()
    },
    onReconnect: () => router.refresh(),
  })

  /** Handler for one PC combatant's character-channel ping (UNN-373). */
  function onPcPing(characterId: string, data: unknown) {
    const versions = parseCharacterPing(data)
    if (!versions) return
    const decision = decidePcPing(
      versions,
      pcVitalsVersions.current[characterId]
    )
    if (decision.nextVitals !== undefined) {
      pcVitalsVersions.current[characterId] = decision.nextVitals
    }
    if (decision.refresh) scheduleRefresh()
  }

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      applyOptimistic(event)
      const result = await enqueue((expectedVersion) =>
        applyCombatEvent({ encounterId: encounter.id, expectedVersion, event })
      )
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  /**
   * Ends the encounter (UNN-320): a terminal `status` flip, not a session edit,
   * so it dispatches {@link endEncounterAction} rather than the optimistic reduce
   * path — but still through the shared queue, so it serializes behind any
   * in-flight session write and carries the right version. On success
   * `router.refresh()` re-forks the page to the ended stub.
   */
  function endEncounter() {
    startTransition(async () => {
      const result = await enqueue((expectedVersion) =>
        endEncounterAction({ encounterId: encounter.id, expectedVersion })
      )
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return {
    session,
    isPending,
    dispatch,
    endEncounter,
    pcVitalsVersions,
    onPcPing,
  }
}
