"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  endOfTurnObligations,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import { useCombatantWrite } from "@/components/combat/console/use-combatant-write"
import { combatEnd } from "@/domain/combat/commit/protocol"
import {
  reduceConsoleOptimistic,
  type ConsoleOptimisticAction,
} from "@/domain/combat/console-optimistic"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import { buildConsoleView } from "@/domain/combat/view/console-view"
import { buildRosterView } from "@/domain/combat/view/roster-view"
import { buildConsoleZoneLayout } from "@/domain/combat/view/zone-overview"
import { resolveSession } from "@/domain/game-engine-v2"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { fetchEncounterVersion } from "@/lib/sync/fetch-encounter-version"
import { fetchInstanceVersion } from "@/lib/sync/fetch-instance-version"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The live DM console's owner-mode write surface, rewritten onto engine v2
 * (UNN-535) — the encounter analog of `useInventoryEditor`. It mirrors the
 * server's reducers optimistically, so the frame the DM sees is structurally
 * identical to what `applyCombatEventAction` persists; failures toast while
 * React reverts the optimistic state automatically.
 *
 * **One optimistic container (UNN-535).** v1's two containers (session +
 * instance, each with its own reducer) collapse into a single
 * `useOptimistic<EncounterState, ConsoleOptimisticAction>` over
 * `{ session, mapInstance }` reduced by {@link reduceConsoleOptimistic} — the
 * same composition root the server runs, plus the paired roster arms and the
 * `write` arm (the Writers' predictor applied to the participant **in the
 * current frame**, the structural UNN-226 fix). The **two version queues**
 * survive: the encounter row and the Instance row still version independently,
 * so {@link dispatchCombatEvent} routes each event to the queue owning the row
 * it writes, both with one-shot stale-retry (`fetchEncounterVersion` /
 * `fetchInstanceVersion`).
 *
 * **Component writes** (HP/SP damage & heal on inline enemies and durable PCs)
 * go through {@link useCombatantWrite} and the combat predicted root.
 *
 * **Realtime (UNN-373)** is unchanged in shape: the encounter channel's
 * kind-routed ping compare (encounter vs mapInstance version streams), the
 * microtask-deduped `scheduleRefresh`, and the per-PC character channels —
 * both the channel list and the per-PC ping handler come resolved off the
 * lanes module.
 *
 * **Combat end** is `combat.end` in the same root. The authority derives whether
 * the encounter is standalone or dungeon-backed from storage and commits the
 * corresponding two- or three-axis transaction. The generic event queues and
 * transitional optimistic wrapper remain for P3c.
 */
export function useCombatConsole(data: EncounterForDM) {
  const { encounter, participantMeta } = data
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const combatRoot = useCombatPredictions({ canon: data.canon })

  const [state, applyOptimistic] = useOptimistic<
    EncounterState,
    ConsoleOptimisticAction
  >(combatRoot.value, reduceConsoleOptimistic)

  const encounterWrite = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })
  const instanceWrite = useQueuedWrite({
    serverVersion: data.instanceVersion,
    refetchVersion: () => fetchInstanceVersion(encounter.shortId),
  })
  const { versionRef } = encounterWrite

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
      const ping = parseVersionPing(data, "encounter")
      if (!ping) return
      // The encounter channel carries two version streams (UNN-468): an
      // `encounter` ping compares against the encounter ref, a `mapInstance`
      // ping (a concurrent spatial write) against the Instance ref.
      const ref =
        ping.kind === "mapInstance" ? instanceWrite.versionRef : versionRef
      if (ping.version <= ref.current) return
      scheduleRefresh()
    },
    onReconnect: () => router.refresh(),
  })

  /**
   * Dispatches a run of events **serially** in one transition — each awaited to
   * completion (including its `foldInstanceVersion` bump) before the next
   * begins, then stopping on the first failure. Serial is load-bearing for a
   * batch of **placed** `addParticipant`s (mid-combat reinforcements into a
   * zone): each paired write bumps the Instance row, and the fold advancing
   * `instanceWrite`'s token runs *after* the enqueue resolves — so firing them
   * concurrently would let the second add read a stale `expectedInstanceVersion`
   * and fail. Awaiting each dispatch orders the fold before the next read.
   *
   * No client `router.refresh()` per dispatch (UNN-482): the combat actions call
   * `revalidateEncounter`, whose RSC payload rides this transition's action
   * response and advances the `useOptimistic` base — a rapid burst accumulates
   * and reconciles with zero client refreshes. PC HP (a cross-route read) stays
   * live via the realtime PC-ping path.
   */
  function dispatchSequence(events: ConsoleDispatchEvent[]) {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          for (const event of events) {
            const result = await dispatchCombatEvent({
              event,
              encounterId: encounter.id,
              applyOptimistic,
              encounterWrite,
              instanceWrite,
            })
            if (!result.ok) {
              toast.error(combatErrorMessage(result.error))
              return
            }
          }
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  function dispatch(event: ConsoleDispatchEvent) {
    dispatchSequence([event])
  }

  const { dispatchWrite, pending: combatWritePending } = useCombatantWrite({
    encounterId: encounter.id,
    root: combatRoot,
  })

  /**
   * Ends the encounter through the intent-only combat protocol. The authority
   * serializes and stamps every changed row; acceptance refreshes the route into
   * its next lifecycle surface.
   */
  function endEncounter() {
    const result = combatRoot.mutate(combatEnd({ encounterId: encounter.id }))
    if (!result.ok) {
      toast.error(combatErrorMessage(result.error))
      return
    }
    void result.value.accepted.then((accepted) => {
      if (accepted.ok) {
        router.refresh()
        return
      }
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        toast.error(combatErrorMessage(accepted.error.error))
      }
    })
  }

  // ── The derived combat view (UNN-467, rebuilt on v2 view builders) ────────
  // React Compiler memoizes these by their data deps — one resolveSession per
  // optimistic frame, every read below folding over the same resolved view.
  const resolved = resolveSession(state.session, state.mapInstance)
  const view = buildConsoleView(state.session, resolved)
  const { currentActor } = view
  const roster = buildRosterView(
    state.session,
    resolved,
    state.mapInstance,
    participantMeta
  )
  const zoneLayout = buildConsoleZoneLayout(state.mapInstance, resolved)
  const fallenPcNames = roster.players
    .filter((row) => row.isFallen)
    .map((row) => row.name)

  const obligations =
    currentActor !== null
      ? endOfTurnObligations(resolved, currentActor.id)
      : null

  return {
    session: state.session,
    instance: state.mapInstance,
    resolved,
    isPending: isPending || combatWritePending,
    dispatch,
    dispatchSequence,
    dispatchWrite,
    endEncounter,
    // derived combat view
    view,
    currentActor,
    roster,
    zoneLayout,
    fallenPcNames,
    obligations,
    onDraft: (participantId: ParticipantId) =>
      dispatch({ kind: "draftCombatant", participantId }),
    onAdvanceRound: () => dispatch({ kind: "advanceRound" }),
  }
}
