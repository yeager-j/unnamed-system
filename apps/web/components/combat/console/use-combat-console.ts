"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  endOfTurnObligations,
  type CombatEvent,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import { useCombatantWrite } from "@/components/combat/console/use-combatant-write"
import { useEncounterIntent } from "@/components/combat/console/use-encounter-intent"
import {
  composeCombatModel,
  encounterRootDiffersFromLoaderFrame,
} from "@/domain/combat/compose-combat-model"
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
import {
  addParticipantAction,
  removeParticipantAction,
} from "@/lib/actions/combat/roster"
import { startCombatAction } from "@/lib/actions/combat/start-combat"
import { runCommand } from "@/lib/sync/command-coordinator"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The live DM console's owner-mode write surface (UNN-535; command coordinator
 * UNN-657). The Encounter and Map Replicas own ordinary intent prediction and
 * are the sole optimistic authority; the classic expected-version queue and
 * the paired-roster `useOptimistic` mirrors are gone.
 *
 * **Two write species (UNN-657).** Zone-less inline adds and every ordinary
 * session/component gesture are Replica intent (`replica.mutate` — predicted,
 * ordered, deduplicated, rebased). Lifecycle and cross-root work — start
 * combat, placed/durable adds, removes, end combat — are explicit commands
 * through {@link runCommand}: settle the Encounter + durable replicas and the
 * Map Replica, then invoke the named Server Action once with semantic
 * arguments. The authority locks current rows and validates in-transaction;
 * ambiguous deliveries resolve by each command's natural idempotency, so
 * there is no client version token and no stale retry. Roster commands are
 * deliberately **non-optimistic**: the transition's pending state is the UX,
 * and the RSC revalidation riding the action response advances the frame.
 *
 * **Component writes** (HP/SP damage & heal) go through
 * {@link useCombatantWrite} over the combat replicas; each replica owns its
 * own ordering, delivery, dedup, retry, and projection.
 *
 * **Realtime (UNN-373):** encounter and PC pings are Replica invalidations.
 * Ordinary accepted roots render directly; route refresh is reserved for a
 * ready Encounter root that proves command-owned loader metadata diverged.
 * Map pings invalidate the Map Replica independently.
 *
 * **The combat-end write is the one route-varying seam (UNN-536).** The
 * mapless encounter ends via the two-row {@link endCombatAction}; a delve
 * ends via the three-row `endDungeonCombatAction` (+ the dungeon turn
 * advance). The route body injects an {@link EndCombatPerformer} through
 * `options.endCombat`; it takes no version arguments — the authority locks
 * current rows.
 */
export type EndCombatPerformer = () => Promise<
  Result<{ version: number; instanceVersion: number }, EndCombatError>
>

/**
 * The `addParticipant` gesture as the console dispatches it: a client-minted
 * `id` (the command/mutation idempotency key) with a two-arm entity source —
 * `{ entity }` for an inline combatant the client fully holds, `{ entityId }`
 * for a durable PC joiner the *server* hydrates from its character row (R6.2).
 */
export interface AddParticipantDispatch {
  kind: "addParticipant"
  setup: { id: ParticipantId; side: CombatSide; zoneId?: string } & (
    | { entity: Entity }
    | { entityId: string }
  )
}

/** Every event the console/setup surface may dispatch. */
export type ConsoleDispatchEvent =
  | Exclude<CombatEvent, { kind: "addParticipant" }>
  | AddParticipantDispatch
  | MapInstanceEvent

export type CombatCommandDispatchEvent =
  | Extract<CombatEvent, { kind: "startCombat" | "removeParticipant" }>
  | AddParticipantDispatch

/**
 * Maps one console command gesture to its named Server Action — the whole
 * surviving command vocabulary (UNN-657): start, placed/durable add, remove.
 * Shared by the live console and the setup shell; both run it through
 * {@link import("@/lib/sync/command-coordinator").runCommand}.
 */
export function invokeCombatCommand(
  encounterId: string,
  event: CombatCommandDispatchEvent
): Promise<
  Result<
    { version: number; instanceVersion?: number },
    Parameters<typeof combatErrorMessage>[0]
  >
> {
  if (event.kind === "startCombat") {
    return startCombatAction({
      encounterId,
      advantage: event.advantage,
      firstSide: event.firstSide,
    })
  }
  if (event.kind === "removeParticipant") {
    return removeParticipantAction({
      encounterId,
      participantId: event.participantId,
    })
  }
  const { setup } = event
  return addParticipantAction({
    encounterId,
    setup:
      "entityId" in setup
        ? {
            id: setup.id,
            side: setup.side,
            entityId: setup.entityId,
            ...(setup.zoneId !== undefined ? { zoneId: setup.zoneId } : {}),
          }
        : {
            id: setup.id,
            side: setup.side,
            entity: {
              id: setup.entity.id,
              components: setup.entity.components,
            },
            // The inline command arm requires a zone; the zone-less inline
            // add routes to the Encounter Replica before reaching here.
            zoneId: setup.zoneId as string,
          },
  })
}

export function useCombatConsole(
  data: EncounterForDM,
  options: { endCombat?: EndCombatPerformer } = {}
) {
  const { encounter, participantMeta } = data
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const mapReplica = useMapInstanceReplica({
    mapInstanceId: data.instance.id,
    initial: {
      state: data.instance.state,
      status: data.instance.status,
    },
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
  // follows the loader frame's roster, while participantMeta supplies only
  // storage/addressing facts.
  const replicas = useCombatReplicas({
    encounterId: encounter.id,
    participantMeta,
    rosterIds: data.session.participants.map((p) => p.id),
    onEncounterUnavailable: scheduleRefresh,
  })

  const state = composeCombatModel({
    eventFrame: {
      session: data.session,
      mapInstance: mapReplica.state,
    },
    loaderVersion: encounter.version,
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
   * Runs one roster/lifecycle command through the coordinator: settle the
   * Encounter + durable replicas, then the Map Replica, then invoke the named
   * action once. Uniform barriers — inline adds now ride the Encounter
   * Replica, so even `startCombat` must settle the encounter root before the
   * authority validates the roster it's about to commit on.
   */
  async function runCombatCommand<
    E extends Parameters<typeof combatErrorMessage>[0],
  >(
    command: () => Promise<
      Result<{ version: number; instanceVersion?: number }, E>
    >
  ): Promise<boolean> {
    const result = await runCommand(
      [replicas.settleAll, mapReplica.settle],
      command
    )
    if (!result.ok) {
      toast.error(combatErrorMessage(result.error))
      return false
    }
    replicas.notifyEncounterPing()
    if (result.value.instanceVersion !== undefined) mapReplica.notify()
    return true
  }

  /**
   * Dispatches a run of events **serially** in one transition — each awaited
   * to completion before the next begins, then stopping on the first failure.
   * Serial ordering remains load-bearing for encounter-roster edits.
   *
   * No client `router.refresh()` per dispatch (UNN-482): the command actions
   * call `revalidateEncounter`, whose RSC payload rides this transition's
   * action response and advances the loader frame — a rapid burst accumulates
   * and reconciles with zero client refreshes.
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
            if (isZonelessInlineAdd(event)) {
              const result = await dispatchIntent(
                toInlineAddIntent([event.setup]),
                { roundComplete: view.roundComplete }
              )
              if (!result?.ok) return
              continue
            }
            if (isCombatCommandEvent(event)) {
              const committed = await runCombatCommand(() =>
                invokeCombatCommand(encounter.id, event)
              )
              if (!committed) return
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
  })

  const endCombat: EndCombatPerformer =
    options.endCombat ?? (() => endCombatAction({ encounterId: encounter.id }))

  /**
   * Ends the encounter: the composed v2 combat-end (overlay sweep + occupancy
   * prune + `ended` status flip, one transaction — plus the dungeon turn
   * advance when {@link options.endCombat} is the delve performer), run
   * through the coordinator. Settlement first: component writes ride the
   * replicas and never touch a command queue, so the barrier is what
   * preserves the ordering the DM expects — a click that landed before "End
   * Combat" still counts. The authority refuses a post-end write outright
   * (`encounter-not-live`, under the encounter row lock).
   */
  function endEncounter() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          if (!(await runCombatCommand(endCombat))) return
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  // ── The derived combat view (UNN-467, rebuilt on v2 view builders) ────────
  // React Compiler memoizes these by their data deps — one resolveSession per
  // composed frame, every read below folding over the same resolved view.
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
    isPending: isPending || !replicas.encounterIntentReady,
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

/** Converts console add-setups to the Encounter Replica's batch intent. */
export function toInlineAddIntent(
  setups: readonly { id: ParticipantId; side: CombatSide; entity: Entity }[]
) {
  return {
    kind: "addInlineParticipants" as const,
    participants: setups.map((setup) => ({
      participantId: setup.id,
      side: setup.side,
      entity: { id: setup.entity.id, components: setup.entity.components },
    })),
  }
}

export function isZonelessInlineAdd(
  event: ConsoleDispatchEvent
): event is AddParticipantDispatch & {
  setup: { id: ParticipantId; side: CombatSide; entity: Entity }
} {
  return (
    event.kind === "addParticipant" &&
    "entity" in event.setup &&
    event.setup.zoneId === undefined
  )
}

export function isCombatCommandEvent(
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
