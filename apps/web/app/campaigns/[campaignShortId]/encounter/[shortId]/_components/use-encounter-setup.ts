"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import type { EncounterState } from "@workspace/game-v2/encounter"

import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import {
  reduceConsoleOptimistic,
  type ConsoleOptimisticAction,
} from "@/domain/combat/console-optimistic"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
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
 * Every roster / zone / placement / engagement edit drives through the *same*
 * optimistic container ({@link reduceConsoleOptimistic} over
 * `{ session, mapInstance }`) and the same {@link dispatchCombatEvent} routing
 * onto `applyCombatEventAction` — no Save button; each edit persists per
 * interaction and the optimistic frame mirrors it instantly.
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

  useRealtimeChannel({
    domain: "encounter",
    shortId: data.encounter.shortId,
    onPing: (payload) => {
      const ping = parseVersionPing(payload, "encounter")
      if (!ping) return
      if (ping.kind === "mapInstance") mapReplica.notify()
      else if (ping.version > encounterWrite.versionRef.current)
        router.refresh()
    },
    onReconnect: () => {
      mapReplica.notify()
      router.refresh()
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
          const result = await dispatchCombatEvent({
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
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  return {
    state: { ...state, mapInstance: mapReplica.state },
    isPending,
    dispatch,
  }
}
