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

import type { EncounterState } from "@workspace/game-v2/encounter"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import {
  dispatchCombatCommand,
  type CombatCommandDispatchEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
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
import { isMapInstanceReplicaEvent } from "@/domain/map/replica/mutations"
import { useMapInstanceReplica } from "@/domain/map/replica/use-map-instance-replica"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { fetchEncounterVersion } from "@/lib/sync/fetch-encounter-version"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The encounter-**setup** owner-mode write surface (UNN-347), on engine v2
 * (UNN-535): the draft-time sibling of
 * {@link import("@/components/combat/console/use-combat-console").useCombatConsole}.
 * Roster commands retain the paired optimistic container; setup `setSide`
 * rides the draft Encounter Replica, and spatial edits ride the Map Instance
 * Replica. There is no Save button; each edit persists per interaction.
 *
 * Encounter writes retain their serialized version queue. Spatial writes use
 * the Map Instance Replica, whose transport owns rebasing and retries.
 */
export function useEncounterSetup(data: EncounterForDM) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [state, applyOptimistic] = useOptimistic<
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
    serverVersion: data.encounter.version,
    refetchVersion: () => fetchEncounterVersion(data.encounter.shortId),
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

  const replicas = useCombatReplicas({
    encounterId: data.encounter.id,
    participantMeta: data.participantMeta,
    rosterIds: state.session.participants.map((participant) => participant.id),
    includeDurableRoots: false,
    onEncounterUnavailable: scheduleRefresh,
  })

  const composed = composeCombatModel({
    eventFrame: { ...state, mapInstance: mapReplica.state },
    encounterReplicaSnapshot: replicas.encounterReplicaSnapshot,
    durableReplicaSnapshots: replicas.durableReplicaSnapshots,
    participantMeta: data.participantMeta,
  })

  const { dispatchIntent } = useEncounterIntent({
    mutateEncounter: replicas.mutateEncounter,
    onRemoteVersion: (version) => encounterWrite.bump(version),
  })

  useEffect(() => {
    const root = replicas.encounterReplicaSnapshot?.value
    if (
      root !== undefined &&
      encounterRootDiffersFromLoaderFrame(root, {
        status: data.encounter.status,
        session: data.session,
        participantMeta: data.participantMeta,
      })
    ) {
      scheduleRefresh()
    }
  }, [data, replicas.encounterReplicaSnapshot, scheduleRefresh])

  useRealtimeChannel({
    domain: "encounter",
    shortId: data.encounter.shortId,
    onPing: (payload) => {
      const ping = parseVersionPing(payload, "encounter")
      if (!ping) return
      if (ping.kind === "mapInstance") mapReplica.notify()
      else replicas.notifyEncounterPing()
    },
    onReconnect: () => {
      replicas.notifyReconnect()
      mapReplica.notify()
    },
  })
  function dispatch(event: ConsoleDispatchEvent) {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          if (isMapInstanceReplicaEvent(event)) {
            const result = await mapReplica.mutate(event).remote
            if (!result.ok) {
              toast.error("Couldn't update the map. Try again.")
            }
            return
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
              encounterId: data.encounter.id,
              applyOptimistic,
              encounterWrite,
            })
            if (!result.ok) {
              toast.error(combatErrorMessage(result.error))
              return
            }
            if (result.value.instanceVersion !== undefined) mapReplica.notify()
            router.refresh()
            return
          }
          await dispatchIntent(event)
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  return {
    state: composed,
    isPending,
    dispatch,
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
