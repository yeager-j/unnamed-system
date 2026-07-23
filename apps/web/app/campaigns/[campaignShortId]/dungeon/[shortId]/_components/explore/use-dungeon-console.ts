"use client"

import { useState } from "react"
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

export function useDungeonConsole(
  dungeon: Pick<DungeonRow, "id" | "shortId" | "regionId">,
  canon: Canon<DungeonCanonValue>
) {
  const root = useDungeonPredictions({ canon })

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

  // The expand gesture's per-stub pending set (UNN-642, D8 seam 2): the roll is
  // server-owned so nothing is predicted — the spinner on *that* ghost is the
  // whole affordance. An id is added at dispatch and removed on refusal (the
  // ghost is still open and must un-spin). On accept it is deliberately left:
  // the spinner survives the accept → refetch gap, and once the refetched
  // canon shows the stub consumed the ghost node itself unmounts (only open
  // stubs render), so a stale id can never show — it is pruned lazily against
  // the open set on the next dispatch.
  const [pendingStubIds, setPendingStubIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const openStubs = root.value.instance.generation.stubs

  function expandStub(stubId: string, forcedTemplateKey?: string) {
    if (pendingStubIds.has(stubId)) return
    setPendingStubIds((current) => {
      const next = new Set(
        [...current].filter((id) => openStubs[id] !== undefined)
      )
      next.add(stubId)
      return next
    })
    const unmark = () =>
      setPendingStubIds((current) => {
        const next = new Set(current)
        next.delete(stubId)
        return next
      })
    const receipt = dispatchMutation({
      kind: "expandStub",
      stubId,
      ...(forcedTemplateKey === undefined ? {} : { forcedTemplateKey }),
    })
    if (!receipt) {
      unmark()
      return
    }
    void receipt.accepted.then((accepted) => {
      // Refusals toast via dispatchMutation; the benign no-op is an accept and
      // stays silent by construction.
      if (!accepted.ok) unmark()
    })
  }

  function retractZone(zoneId: string) {
    dispatchMutation({ kind: "retractZone", zoneId })
  }

  return {
    dungeonState: root.value.dungeon,
    instanceState: root.value.instance,
    isPending: root.status.pending > 0,
    dispatch,
    placeToken,
    searchReveal,
    finishDelve,
    expandStub,
    retractZone,
    isStubPending: (stubId: string) => pendingStubIds.has(stubId),
  }
}
