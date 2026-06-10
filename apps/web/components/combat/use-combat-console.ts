"use client"

import { useRouter } from "next/navigation"
import { useEffect, useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import { type PcCombatantDetail } from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"

import { parseCharacterPing } from "@/hooks/character-version-sync"
import { parseEncounterPing } from "@/hooks/encounter-ping"
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
 * The version token lives in a **ref synced to the server prop**, not `useState`
 * — the same primitive the sheet's `useCharacterTokenRef` uses. A rapid
 * follow-up tap (draft → end turn before the first write's state commits) reads
 * the freshly-bumped token synchronously from `versionRef.current` instead of a
 * stale render frame, so the second event isn't spuriously rejected as `stale`;
 * the prop-sync effect absorbs the version `router.refresh()` brings back.
 *
 * **Realtime (UNN-373):** the hook also subscribes to the encounter's ping
 * channel and owns the per-PC `vitalsVersion` map the character-channel
 * listeners (mounted by the console root) and the drawer's pools writes share.
 * Every remote ping funnels through one version compare against these local
 * tokens, so the console's *own* writes — which bump the tokens before their
 * ping returns — never double-refresh, while another writer's change (a
 * player's self-heal, a second DM tab's event) refreshes the page. Refreshes
 * are microtask-coalesced: an AoE pinging several PCs at once costs one
 * `router.refresh()`.
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

  const versionRef = useRef(encounter.version)
  useEffect(() => {
    versionRef.current = encounter.version
  }, [encounter.version])

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
      versionRef.current = ping.version
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
      const result = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: versionRef.current,
        event,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
      router.refresh()
    })
  }

  /**
   * Ends the encounter (UNN-320): a terminal `status` flip, not a session edit,
   * so it goes straight through {@link endEncounterAction} (guarded on the live
   * `versionRef`) rather than the optimistic reduce path. On success
   * `router.refresh()` re-forks the page to the ended stub.
   */
  function endEncounter() {
    startTransition(async () => {
      const result = await endEncounterAction({
        encounterId: encounter.id,
        expectedVersion: versionRef.current,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
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
