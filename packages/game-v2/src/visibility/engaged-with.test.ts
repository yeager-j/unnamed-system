import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/encounter/ids"

import { engagedWith } from "./engaged-with"

describe("engagedWith — the projected-Engagement accessor (CD17)", () => {
  it("returns the locked combatant ids when engaged", () => {
    expect(
      engagedWith({
        status: "engaged",
        targetCombatantIds: [asParticipantId("a"), asParticipantId("b")],
      })
    ).toEqual(["a", "b"])
  })

  it("returns [] when Free", () => {
    expect(engagedWith({ status: "free" })).toEqual([])
  })

  it("returns [] structurally when the component is absent (mapless encounter)", () => {
    expect(engagedWith(undefined)).toEqual([])
  })
})
