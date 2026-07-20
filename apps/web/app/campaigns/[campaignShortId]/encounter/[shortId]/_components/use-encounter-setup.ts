"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import {
  invokeCombatCommand,
  isCombatCommandEvent,
  isZonelessInlineAdd,
  toInlineAddIntent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/use-combat-console"
import { useEncounterIntent } from "@/components/combat/console/use-encounter-intent"
import {
  composeCombatModel,
  encounterRootDiffersFromLoaderFrame,
} from "@/domain/combat/compose-combat-model"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { useCombatReplicas } from "@/domain/combat/replica/use-combat-replicas"
import { isMapInstanceReplicaEvent } from "@/domain/map/replica/mutations"
import { useMapInstanceReplica } from "@/domain/map/replica/use-map-instance-replica"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { runCommand } from "@/lib/sync/command-coordinator"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The encounter-**setup** owner-mode write surface (UNN-347), on engine v2
 * (UNN-535; command coordinator UNN-657): the draft-time sibling of
 * {@link import("@/components/combat/console/use-combat-console").useCombatConsole}.
 * Zone-less inline adds and setup `setSide` ride the draft Encounter Replica
 * (predicted); durable adds, removes, and Start are coordinator commands with
 * explicit pending UX — the classic version queue and the paired optimistic
 * mirrors are gone. Spatial edits ride the Map Instance Replica. There is no
 * Save button; each edit persists per interaction.
 */
export function useEncounterSetup(data: EncounterForDM) {
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

  const replicas = useCombatReplicas({
    encounterId: data.encounter.id,
    participantMeta: data.participantMeta,
    rosterIds: data.session.participants.map((participant) => participant.id),
    includeDurableRoots: false,
    onEncounterUnavailable: scheduleRefresh,
  })

  const composed = composeCombatModel({
    eventFrame: { session: data.session, mapInstance: mapReplica.state },
    loaderVersion: data.encounter.version,
    encounterReplicaSnapshot: replicas.encounterReplicaSnapshot,
    durableReplicaSnapshots: replicas.durableReplicaSnapshots,
    participantMeta: data.participantMeta,
  })

  const { dispatchIntent } = useEncounterIntent({
    mutateEncounter: replicas.mutateEncounter,
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
          if (isZonelessInlineAdd(event)) {
            await dispatchIntent(toInlineAddIntent([event.setup]))
            return
          }
          if (isCombatCommandEvent(event)) {
            const result = await runCommand(
              [replicas.settleAll, mapReplica.settle],
              () => invokeCombatCommand(data.encounter.id, event)
            )
            if (!result.ok) {
              toast.error(combatErrorMessage(result.error))
              return
            }
            replicas.notifyEncounterPing()
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
    isPending: isPending || !replicas.encounterIntentReady,
    dispatch,
  }
}

function isMapEvent(event: ConsoleDispatchEvent): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}
