"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import type { DungeonEvent, MapInstanceEvent } from "@workspace/game-v2/spatial"
import type { Canon } from "@workspace/headcanon"

import {
  dungeonCommand,
  type DungeonCanonValue,
  type DungeonCommandRefusal,
} from "@/domain/dungeon/commit/protocol"
import { useDungeonPredictions } from "@/domain/dungeon/use-dungeon-predictions"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import type { DungeonRow } from "@/lib/db/schema/dungeon"

const DELIVERY_TOAST_ID = "dungeon-delivery-uncertain"
const FRESHNESS_TOAST_ID = "dungeon-refresh-stalled"

export function useDungeonConsole(
  dungeon: Pick<DungeonRow, "id" | "shortId" | "regionId">,
  canon: Canon<DungeonCanonValue>
) {
  const router = useRouter()
  const root = useDungeonPredictions({ canon })

  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your dungeon change is kept.", {
        id: DELIVERY_TOAST_ID,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(DELIVERY_TOAST_ID)
    }
  }, [root.status.delivery, root.retryDelivery])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error("Couldn't confirm the latest dungeon changes.", {
        id: FRESHNESS_TOAST_ID,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(FRESHNESS_TOAST_ID)
    }
  }, [root.status.freshness, root.retryRefresh])

  const surfacedConflicts = useRef(0)
  useEffect(() => {
    if (root.conflicts.length > surfacedConflicts.current) {
      surfacedConflicts.current = root.conflicts.length
      toast.error("A dungeon change was rolled back because the delve changed.")
    }
  }, [root.conflicts])

  function surface(error: DungeonCommandRefusal): void {
    toast.error(dungeonErrorMessage(error))
  }

  function dispatchMutation(
    command: Parameters<typeof dungeonCommand>[0]["command"]
  ) {
    const result = root.mutate(
      dungeonCommand({ dungeonId: dungeon.id, command })
    )
    if (!result.ok) {
      surface(result.error)
      return null
    }
    void result.value.accepted.then((accepted) => {
      if (accepted.ok) return
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        surface(accepted.error.error)
      }
    })
    return result.value
  }

  function dispatch(event: DungeonEvent | MapInstanceEvent) {
    dispatchMutation({ kind: "event", event })
  }

  function placeToken(characterId: string, zoneId: string) {
    const needsReveal =
      root.value.instance.geometry.zones[zoneId] !== undefined &&
      !root.value.instance.reveal.revealedZoneIds.includes(zoneId)
    const receipt = dispatchMutation({
      kind: "event",
      event: { kind: "placeCombatant", tokenKey: characterId, zoneId },
    })
    if (!receipt || !needsReveal) return
    void receipt.accepted.then((accepted) => {
      if (accepted.ok) {
        dispatchMutation({
          kind: "event",
          event: { kind: "revealZone", zoneId },
        })
      }
    })
  }

  function searchReveal(characterId: string, event: MapInstanceEvent) {
    dispatchMutation({ kind: "searchReveal", characterId, event })
  }

  function finishDelve() {
    dispatchMutation({ kind: "finish" })
  }

  const refreshScheduled = useRef(false)
  function scheduleRefresh() {
    if (refreshScheduled.current) return
    refreshScheduled.current = true
    queueMicrotask(() => {
      refreshScheduled.current = false
      router.refresh()
    })
  }

  return {
    dungeonState: root.value.dungeon,
    instanceState: root.value.instance,
    isPending: root.status.pending > 0,
    dispatch,
    placeToken,
    searchReveal,
    finishDelve,
    scheduleRefresh,
  }
}
