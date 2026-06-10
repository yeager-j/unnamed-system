import { describe, expect, it } from "vitest"

import { combatEventSchema } from "@workspace/game/foundation/encounter/session-event"

describe("combatEventSchema", () => {
  it("accepts every event kind with a valid payload", () => {
    const valid = [
      { kind: "endTurn" },
      { kind: "startCombat", advantage: "players", firstSide: "players" },
      { kind: "startCombat", advantage: "neutral", firstSide: "enemies" },
      { kind: "advanceRound" },
      {
        kind: "addCombatant",
        setup: {
          side: "enemies",
          ref: { kind: "pc", characterId: "char-1" },
          zoneId: "zone-a",
        },
      },
      { kind: "removeCombatant", combatantId: "combatant-1" },
      {
        kind: "adjustBattleConditionAxis",
        combatantId: "combatant-1",
        axis: "attack",
        action: "increase",
        turns: 3,
      },
      {
        kind: "adjustBattleConditionAxis",
        combatantId: "combatant-1",
        axis: "defense",
        action: "clear",
      },
    ]

    for (const event of valid) {
      expect(combatEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("rejects an unknown discriminant", () => {
    expect(combatEventSchema.safeParse({ kind: "explode" }).success).toBe(false)
  })

  it("rejects a payload missing its discriminant", () => {
    expect(combatEventSchema.safeParse({ combatantId: "x" }).success).toBe(
      false
    )
  })

  it("rejects startCombat with an out-of-range advantage", () => {
    expect(
      combatEventSchema.safeParse({
        kind: "startCombat",
        advantage: "monsters",
        firstSide: "players",
      }).success
    ).toBe(false)
  })

  it("rejects an unknown battle-condition axis", () => {
    expect(
      combatEventSchema.safeParse({
        kind: "adjustBattleConditionAxis",
        combatantId: "combatant-1",
        axis: "speed",
        action: "increase",
      }).success
    ).toBe(false)
  })

  it("rejects an unknown battle-condition action", () => {
    expect(
      combatEventSchema.safeParse({
        kind: "adjustBattleConditionAxis",
        combatantId: "combatant-1",
        axis: "attack",
        action: "obliterate",
      }).success
    ).toBe(false)
  })

  it("rejects a non-positive duration", () => {
    expect(
      combatEventSchema.safeParse({
        kind: "adjustBattleConditionAxis",
        combatantId: "combatant-1",
        axis: "attack",
        action: "increase",
        turns: 0,
      }).success
    ).toBe(false)
  })

  it("rejects addCombatant with a malformed setup", () => {
    expect(
      combatEventSchema.safeParse({
        kind: "addCombatant",
        setup: { side: "enemies", zoneId: "zone-a" },
      }).success
    ).toBe(false)
  })

  it("rejects an empty zone name (matching zoneSchema's min(1))", () => {
    expect(
      combatEventSchema.safeParse({ kind: "addZone", name: "" }).success
    ).toBe(false)
    expect(
      combatEventSchema.safeParse({
        kind: "renameZone",
        zoneId: "zone-0",
        name: "",
      }).success
    ).toBe(false)
  })
})
