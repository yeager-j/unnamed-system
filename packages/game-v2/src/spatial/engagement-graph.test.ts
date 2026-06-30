import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"

import { engagedWith, setEngaged, unlink } from "./engagement-graph"

const pid = asParticipantId
const holder = (engagement: Engagement) => ({ engagement })

describe("engagedWith", () => {
  it("returns the target ids when engaged", () => {
    expect(
      engagedWith(
        holder({
          status: "engaged",
          targetCombatantIds: [pid("a"), pid("b")],
        })
      )
    ).toEqual(["a", "b"])
  })

  it("returns [] when Free", () => {
    expect(engagedWith(holder({ status: "free" }))).toEqual([])
  })
})

describe("setEngaged", () => {
  it("stamps an engaged status from a non-empty list", () => {
    const h = holder({ status: "free" })
    setEngaged(h, [pid("a")])
    expect(h.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
  })

  it("reverts to Free on an empty list (never an empty `engaged`)", () => {
    const h = holder({ status: "engaged", targetCombatantIds: [pid("a")] })
    setEngaged(h, [])
    expect(h.engagement).toEqual({ status: "free" })
  })
})

describe("unlink", () => {
  it("drops one link, keeping the rest", () => {
    const h = holder({
      status: "engaged",
      targetCombatantIds: [pid("a"), pid("b")],
    })
    unlink(h, pid("a"))
    expect(h.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
  })

  it("reverts to Free when dropping the last link", () => {
    const h = holder({ status: "engaged", targetCombatantIds: [pid("a")] })
    unlink(h, pid("a"))
    expect(h.engagement).toEqual({ status: "free" })
  })

  it("no-ops when not engaged with the id", () => {
    const h = holder({ status: "engaged", targetCombatantIds: [pid("a")] })
    unlink(h, pid("z"))
    expect(h.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
  })

  it("no-ops on a Free holder", () => {
    const h = holder({ status: "free" })
    unlink(h, pid("a"))
    expect(h.engagement).toEqual({ status: "free" })
  })
})
