"use client"

import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useTransition,
} from "react"
import { toast } from "sonner"

import {
  endOfTurnObligations,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import {
  dispatchCombatCommand,
  type CombatCommandDispatchEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import { useCombatantWrite } from "@/components/combat/console/use-combatant-write"
import { useEncounterIntent } from "@/components/combat/console/use-encounter-intent"
import {
  composeCombatModel,
  encounterRootDiffersFromLoaderFrame,
} from "@/domain/combat/compose-combat-model"
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
import { isMapInstanceReplicaEvent } from "@/domain/map/replica/mutations"
import { useMapInstanceReplica } from "@/domain/map/replica/use-map-instance-replica"
import { endCombatAction } from "@/lib/actions/combat/end-combat"
import { type EndCombatError } from "@/lib/actions/combat/end-combat.schema"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { fetchEncounterVersion } from "@/lib/sync/fetch-encounter-version"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The live DM console's owner-mode write surface, rewritten onto engine v2
 * (UNN-535) — the encounter analog of `useInventoryEditor`. The Encounter and
 * Map Replicas own ordinary intent prediction; the remaining optimistic frame
 * mirrors only command-owned roster changes.
 *
 * **One optimistic container (UNN-535).** v1's two containers (session +
 * instance, each with its own reducer) collapse into a single
 * `useOptimistic<EncounterState, ConsoleOptimisticAction>` over
 * `{ session, mapInstance }` reduced by {@link reduceConsoleOptimistic} — the
 * same composition root the server runs, plus the paired roster arms. Combat
 * components are composed over that frame from Replica projections; the
 * container no longer predicts them. Start/add/remove and encounter-end
 * commands retain one serialized version queue; spatial intent is owned by
 * the Map Instance Replica.
 *
 * **Component writes** (HP/SP damage & heal — on inline enemies *and* durable
 * PCs, deliberately superseding UNN-482's read-only PC vitals per UNN-535's
 * AC) go through {@link useCombatantWrite}, over the combat replicas
 * (UNN-646). {@link useCombatReplicas} resolves `participantMeta` into
 * per-participant write handles once, so this hook never reads a storage tag.
 * **Those writes do NOT ride the encounter version queue** — each replica owns its
 * own ordering, delivery, dedup, retry, and projection. Anything that must
 * not overtake them says so explicitly by awaiting `replicas.settleAll()`
 * (see {@link endEncounter}); the encounter queue serializes only commands.
 *
 * **Realtime (UNN-373):** encounter and PC pings are Replica invalidations.
 * Ordinary accepted roots render directly; route refresh is reserved for a
 * ready Encounter root that proves command-owned loader metadata diverged.
 * Map pings invalidate the Map Replica independently.
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

  const [eventFrame, applyOptimistic] = useOptimistic<
    EncounterState,
    ConsoleOptimisticAction
  >(
    { session: data.session, mapInstance: data.instance.state },
    reduceConsoleOptimistic
  )

  const mapReplica = useMapInstanceReplica({
    mapInstanceId: data.instance.id,
    initial: {
      state: data.instance.state,
      status: data.instance.status,
    },
  })

  const encounterWrite = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })
  const refreshScheduled = useRef(false)
  const scheduleRefresh = useCallback(() => {
    if (refreshScheduled.current) return
    refreshScheduled.current = true
    queueMicrotask(() => {
      refreshScheduled.current = false
      router.refresh()
    })
  }, [router])

  // The app's ownership decision point (UNN-646) now also exposes the ready
  // projections that own component rendering (UNN-653). Controller membership
  // follows the event frame's current roster, while participantMeta supplies
  // only storage/addressing facts.
  const replicas = useCombatReplicas({
    encounterId: encounter.id,
    participantMeta,
    rosterIds: eventFrame.session.participants.map((p) => p.id),
    onEncounterUnavailable: scheduleRefresh,
  })

  const state = composeCombatModel({
    eventFrame: { ...eventFrame, mapInstance: mapReplica.state },
    encounterReplicaSnapshot: replicas.encounterReplicaSnapshot,
    durableReplicaSnapshots: replicas.durableReplicaSnapshots,
    participantMeta,
  })

  useEffect(() => {
    const root = replicas.encounterReplicaSnapshot?.value
    if (
      root !== undefined &&
      encounterRootDiffersFromLoaderFrame(root, {
        status: encounter.status,
        session: data.session,
        participantMeta,
      })
    ) {
      scheduleRefresh()
    }
  }, [
    data.session,
    encounter.status,
    participantMeta,
    replicas.encounterReplicaSnapshot,
    scheduleRefresh,
  ])

  const { dispatchIntent } = useEncounterIntent({
    mutateEncounter: replicas.mutateEncounter,
    onRemoteVersion: (version) => encounterWrite.bump(version),
  })

  useRealtimeChannel({
    domain: "encounter",
    shortId: encounter.shortId,
    onPing: (data) => {
      const ping = parseVersionPing(data, "encounter")
      if (!ping) return
      if (ping.kind === "mapInstance") mapReplica.notify()
      else replicas.notifyEncounterPing()
    },
    onReconnect: () => {
      replicas.notifyReconnect()
      mapReplica.notify()
    },
  })

  /**
   * Dispatches a run of events **serially** in one transition — each awaited to
   * completion before the next begins, then stopping on the first failure.
   * Serial ordering remains load-bearing for encounter-roster edits.
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
            if (isMapInstanceReplicaEvent(event)) {
              const result = await mapReplica.mutate(event).remote
              if (!result.ok) {
                toast.error("Couldn't update the map. Try again.")
                return
              }
              continue
            }
            if (isMapEvent(event)) {
              toast.error("That map operation isn't available here.")
              return
            }
            if (isCombatCommandEvent(event)) {
              if (
                event.kind === "startCombat" ||
                event.kind === "removeParticipant" ||
                (event.kind === "addParticipant" &&
                  event.setup.zoneId !== undefined)
              ) {
                const settled = await mapReplica.settle()
                if (!settled.ok) {
                  toast.error("Couldn't finish saving the map. Try again.")
                  return
                }
              }
              const result = await dispatchCombatCommand({
                event,
                encounterId: encounter.id,
                applyOptimistic,
                encounterWrite,
              })
              if (!result.ok) {
                toast.error(combatErrorMessage(result.error))
                return
              }
              if (result.value.instanceVersion !== undefined) {
                mapReplica.notify()
              }
              continue
            }
            const result = await dispatchIntent(event, {
              roundComplete: view.roundComplete,
            })
            if (!result?.ok) return
          }
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  function dispatch(event: ConsoleDispatchEvent) {
    dispatchSequence([event])
  }

  const { dispatchWrite } = useCombatantWrite({
    handleOf: replicas.handleOf,
    // The inline door's committed encounter version keeps the surviving
    // command queue's token fresh across the two protocols sharing the row.
    onRemoteVersion: (version) => encounterWrite.bump(version),
  })

  const endCombat: EndCombatPerformer =
    options.endCombat ??
    (({ encounterVersion }) =>
      endCombatAction({
        encounterId: encounter.id,
        expectedVersion: encounterVersion,
      }))

  /**
   * Ends the encounter: the composed v2 combat-end (overlay sweep + occupancy
   * prune + `ended` status flip, one transaction — plus
   * the dungeon turn advance when {@link options.endCombat} is the delve
   * performer). The authority locks and settles the current Map Instance before
   * pruning it; its returned cursor is only an invalidation signal.
   *
   * **`settleAll()` first.** Component writes ride the replicas, which own
   * their own delivery loops and never touch `encounterWrite` — so the encounter
   * queue does NOT serialize them, and without this barrier End Combat could
   * commit its sweep while a replica mutation was still in flight. The
   * authority refuses a post-end write outright (`encounter-not-live`, under
   * the encounter row lock); settling here is what preserves the ordering the
   * DM expects, so a click that landed before "End Combat" still counts.
   */
  function endEncounter() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          await replicas.settleAll()
          const mapSettled = await mapReplica.settle()
          if (!mapSettled.ok) {
            toast.error("Couldn't finish saving the map. Try again.")
            return
          }
          const result = await encounterWrite.enqueue((expectedVersion) =>
            endCombat({
              encounterVersion: expectedVersion,
            })
          )
          if (!result.ok) {
            toast.error(combatErrorMessage(result.error))
            return
          }
          mapReplica.notify()
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

function isCombatCommandEvent(
  event: ConsoleDispatchEvent
): event is CombatCommandDispatchEvent {
  return (
    event.kind === "startCombat" ||
    event.kind === "addParticipant" ||
    event.kind === "removeParticipant"
  )
}

function isMapEvent(event: ConsoleDispatchEvent): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}
