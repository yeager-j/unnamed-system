import { describe, expect, it } from "vitest"

import { DEFAULT_BATTLE_CONDITIONS } from "@/lib/game/character"

import { endOfTurnReminders } from "./end-of-turn"
import { makeCombatant, type Combatant } from "./session"

function combatant(patch: Partial<Combatant> = {}): Combatant {
  return {
    ...makeCombatant(
      {
        side: "players",
        ref: { kind: "pc", characterId: "char-1" },
        zoneId: "z",
      },
      "c-1",
      false
    ),
    ...patch,
  }
}

describe("endOfTurnReminders", () => {
  it("reports no reminders for a clean combatant", () => {
    const reminders = endOfTurnReminders(combatant())
    expect(reminders.heldFlags).toEqual([])
    expect(reminders.activeDurations).toEqual([])
  })

  it("lists held Charged / Concentrating flags (in canonical order)", () => {
    const reminders = endOfTurnReminders(
      combatant({
        battleConditions: {
          ...DEFAULT_BATTLE_CONDITIONS,
          charged: true,
          concentrating: true,
        },
      })
    )
    expect(reminders.heldFlags).toEqual(["charged", "concentrating"])
  })

  it("omits a flag that is not held", () => {
    const reminders = endOfTurnReminders(
      combatant({
        battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, concentrating: true },
      })
    )
    expect(reminders.heldFlags).toEqual(["concentrating"])
  })

  it("lists axes with a positive countdown, skipping absent/zero ones", () => {
    const reminders = endOfTurnReminders(
      combatant({ conditionDurations: { attack: 2, hitEvasion: 1 } })
    )
    expect(reminders.activeDurations).toEqual([
      { axis: "attack", turns: 2 },
      { axis: "hitEvasion", turns: 1 },
    ])
  })
})
