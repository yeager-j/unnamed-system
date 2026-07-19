"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  endOfTurnObligations,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { type Result } from "@workspace/result"

import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import { useCombatantWrite } from "@/components/combat/console/use-combatant-write"
import {
  reduceConsoleOptimistic,
  type ConsoleOptimisticAction,
} from "@/domain/combat/console-optimistic"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { useCombatReplicas } from "@/domain/combat/replica/use-combat-replicas"
import { buildConsoleView } from "@/domain/combat/view/console-view"
import { buildRosterView } from "@/domain/combat/view/roster-view"
import { buildConsoleZoneLayout } from "@/domain/combat/view/zone-overview"
import { resolveSession } from "@/domain/game-engine-v2"
import { endCombatAction } from "@/lib/actions/combat/end-combat"
import { type EndCombatError } from "@/lib/actions/combat/end-combat.schema"
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
 * **Component writes** (HP/SP damage & heal — on inline enemies *and* durable
 * PCs, deliberately superseding UNN-482's read-only PC vitals per UNN-535's
 * AC) go through {@link useCombatantWrite}: prediction into the same
 * container, then dispatch on the participant's write lane. The lanes —
 * `useCombatantLanes` (UNN-567), the client half of the CD19 router — resolve
 * `participantMeta` once, so this hook never reads a storage tag: inline lanes
 * ride the encounter queue, durable lanes a per-character queue over the same
 * write-queue core that never touches the encounter ref.
 *
 * **Realtime (UNN-373)** is unchanged in shape: the encounter channel's
 * kind-routed ping compare (encounter vs mapInstance version streams), the
 * microtask-deduped `scheduleRefresh`, and the per-PC character channels —
 * both the channel list and the per-PC ping handler come resolved off the
 * lanes module.
 *
 * **The combat-end write is the one route-varying seam (UNN-536).** The mapless
 * encounter ends via the two-row {@link endCombatAction}; a delve ends via the
 * three-row `endDungeonCombatAction` (+ the dungeon turn advance, a third version
 * token). Rather than re-derive the route from `data`, the route body injects an
 * {@link EndCombatPerformer} through `options.endCombat` — everything else (the
 * two write queues, realtime, the optimistic container, every view builder) stays
 * shared. The performer receives the enqueue-guarded encounter version + the
 * current Instance version and returns an {@link EndCombatError}-typed result, so
 * the dungeon collapses its two extra codes at its own boundary.
 */
export type EndCombatPerformer = (expected: {
  encounterVersion: number
  instanceVersion: number
}) => Promise<
  Result<{ version: number; instanceVersion: number }, EndCombatError>
>

export function useCombatConsole(
  data: EncounterForDM,
  options: { endCombat?: EndCombatPerformer } = {}
) {
  const { encounter, participantMeta } = data
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [state, applyOptimistic] = useOptimistic<
    EncounterState,
    ConsoleOptimisticAction
  >(
    { session: data.session, mapInstance: data.instance.state },
    reduceConsoleOptimistic
  )

  const encounterWrite = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })
  const instanceWrite = useQueuedWrite({
    serverVersion: data.instance.version,
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
      // The inline replica treats every encounter ping as an invalidation;
      // its causal gate decides what the pull means.
      replicas.notifyEncounterPing()
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
    onReconnect: () => {
      replicas.notifyReconnect()
      router.refresh()
    },
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

  // The app's ownership decision point (UNN-646, succeeding the CD19 lanes):
  // participantMeta resolved once into per-participant replica handles; the
  // channel list + ping fan-in ride along, so no `meta.storage` read
  // survives in this hook.
  const replicas = useCombatReplicas({
    encounterId: encounter.id,
    participantMeta,
    rosterIds: state.session.participants.map((p) => p.id),
    onExternalChange: scheduleRefresh,
  })

  const { dispatchWrite } = useCombatantWrite({
    handleOf: replicas.handleOf,
    componentsOf: (participantId) =>
      state.session.participants.find((p) => p.id === participantId)?.entity
        .components,
    applyOptimistic,
    // The inline door's committed encounter version keeps the surviving
    // event queue's token fresh across the two protocols sharing the row.
    onRemoteVersion: (version) => encounterWrite.bump(version),
  })

  const endCombat: EndCombatPerformer =
    options.endCombat ??
    (({ encounterVersion, instanceVersion }) =>
      endCombatAction({
        encounterId: encounter.id,
        expectedVersion: encounterVersion,
        expectedInstanceVersion: instanceVersion,
      }))

  /**
   * Ends the encounter: the composed v2 combat-end (overlay sweep + occupancy
   * prune + `ended` status flip, one transaction over the version tokens — plus
   * the dungeon turn advance when {@link options.endCombat} is the delve
   * performer). Dispatched through the encounter queue so it serializes behind
   * any in-flight session write; the Instance token reads its own ref (no
   * in-flight move at end-time in practice). The action returns the bumped
   * Instance version, folded forward-only into its queue's token (UNN-567).
   */
  function endEncounter() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await encounterWrite.enqueue((expectedVersion) =>
            endCombat({
              encounterVersion: expectedVersion,
              instanceVersion: instanceWrite.versionRef.current,
            })
          )
          if (!result.ok) {
            toast.error(combatErrorMessage(result.error))
            return
          }
          instanceWrite.bump(result.value.instanceVersion)
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
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
    isPending,
    dispatch,
    dispatchSequence,
    dispatchWrite,
    endEncounter,
    onPcPing: replicas.onPcPing,
    // derived combat view
    view,
    currentActor,
    roster,
    zoneLayout,
    fallenPcNames,
    obligations,
    pcChannelIds: replicas.pcChannels,
    onDraft: (participantId: ParticipantId) =>
      dispatch({ kind: "draftCombatant", participantId }),
    onAdvanceRound: () => dispatch({ kind: "advanceRound" }),
  }
}
