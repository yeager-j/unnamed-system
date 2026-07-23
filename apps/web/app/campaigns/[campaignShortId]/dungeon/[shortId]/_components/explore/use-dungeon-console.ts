"use client"

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
import { useMutationRecoveryToasts } from "@/lib/sync/use-mutation-recovery-toasts"

const DUNGEON_RECOVERY_TOASTS = {
  scope: "dungeon",
  messages: {
    delivery: "Connection lost mid-save — your dungeon change is kept.",
    freshness: "Couldn't confirm the latest dungeon changes.",
    conflict: "A dungeon change was rolled back because the delve changed.",
  },
} as const

export function useDungeonConsole(
  dungeon: Pick<DungeonRow, "id" | "shortId" | "regionId">,
  canon: Canon<DungeonCanonValue>
) {
  const root = useDungeonPredictions({ canon })
  useMutationRecoveryToasts(root, DUNGEON_RECOVERY_TOASTS)

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

  return {
    dungeonState: root.value.dungeon,
    instanceState: root.value.instance,
    isPending: root.status.pending > 0,
    dispatch,
    placeToken,
    searchReveal,
    finishDelve,
  }
}
