import { describe, expect, it } from "vitest"

import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  ailmentHpDelta,
  endOfTurnObligations,
  endOfTurnReminders,
} from "@workspace/game/engine/encounter/end-of-turn"
import { makeCombatant } from "@workspace/game/engine/encounter/session-factory"
import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"
import {
  type Combatant,
  type CombatantRef,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

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

function inlineEnemyRef(
  vitals: { maxHP?: number; currentHP?: number } = {}
): CombatantRef {
  return {
    kind: "enemy",
    statBlock: {
      name: "Goblin",
      maxHP: vitals.maxHP ?? 50,
      currentHP: vitals.currentHP ?? vitals.maxHP ?? 50,
      maxSP: 0,
      currentSP: 0,
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    },
  }
}

function session(...combatants: Combatant[]): CombatSession {
  return {
    round: 1,
    combatants,
    currentActorId: combatants[0]?.id ?? null,
    advantage: "neutral",
    firstSide: "players",
  }
}

const lookups = makeTestGameData({
  enemies: [makeEnemy({ key: "goblin", maxHP: 40 })],
})
const obligations = endOfTurnObligations(lookups)

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

describe("ailmentHpDelta", () => {
  it("deals 10% of max HP for Burn (negative)", () => {
    expect(ailmentHpDelta("burn", 50)).toBe(-5)
  })

  it("recovers 10% of max HP for Sleep (positive)", () => {
    expect(ailmentHpDelta("sleep", 50)).toBe(5)
  })

  it("rounds down", () => {
    expect(ailmentHpDelta("burn", 95)).toBe(-9)
    expect(ailmentHpDelta("sleep", 95)).toBe(9)
  })

  it("is zero for ailments with no HP effect", () => {
    expect(ailmentHpDelta("despair", 100)).toBe(0)
    expect(ailmentHpDelta("dizzy", 100)).toBe(0)
  })
})

describe("endOfTurnObligations", () => {
  it("is empty for a clean combatant", () => {
    const result = obligations(session(combatant()), "c-1")
    expect(result.ailments).toEqual([])
    expect(result.activeDurations).toEqual([])
    expect(result.heldFlags).toEqual([])
  })

  it("is empty for an unknown actor id", () => {
    const result = obligations(session(combatant()), "nope")
    expect(result.ailments).toEqual([])
  })

  it("returns a fully empty result for an unknown actor, even when another combatant has obligations", () => {
    const dirty = combatant({
      id: "c-1",
      ailments: ["burn"],
      conditionDurations: { attack: 2 },
      battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, charged: true },
    })
    const result = obligations(session(dirty), "nope")
    expect(result).toEqual({
      ailments: [],
      activeDurations: [],
      heldFlags: [],
      frenzy: null,
    })
  })

  it("resolves an unknown catalog-enemy's max HP to 0 via the getEnemy fallback (no throw)", () => {
    const result = obligations(
      session(
        combatant({
          ref: { kind: "catalog-enemy", enemyKey: "not-a-real-enemy" },
          ailments: ["burn"],
        })
      ),
      "c-1"
    )
    expect(result.ailments).toEqual([{ ailment: "burn", apply: null }])
  })

  it("lists one entry per non-Downed ailment, excluding Downed", () => {
    const result = obligations(
      session(combatant({ ailments: ["downed", "fear"] })),
      "c-1"
    )
    expect(result.ailments).toEqual([{ ailment: "fear", apply: null }])
  })

  it("gives a PC ailment no Apply (reminder only)", () => {
    const result = obligations(
      session(combatant({ ailments: ["burn"] })),
      "c-1"
    )
    expect(result.ailments).toEqual([{ ailment: "burn", apply: null }])
  })

  it("applies Burn damage to an enemy (clamped at 0)", () => {
    const result = obligations(
      session(
        combatant({
          ref: inlineEnemyRef({ maxHP: 50, currentHP: 50 }),
          ailments: ["burn"],
        })
      ),
      "c-1"
    )
    expect(result.ailments).toEqual([
      { ailment: "burn", apply: { field: "currentHP", value: 45, delta: -5 } },
    ])
  })

  it("floors enemy Burn damage at 0 on overkill", () => {
    const result = obligations(
      session(
        combatant({
          ref: inlineEnemyRef({ maxHP: 50, currentHP: 3 }),
          ailments: ["burn"],
        })
      ),
      "c-1"
    )
    expect(result.ailments[0]?.apply).toEqual({
      field: "currentHP",
      value: 0,
      delta: -5,
    })
  })

  it("caps enemy Sleep healing at max HP", () => {
    const result = obligations(
      session(
        combatant({
          ref: inlineEnemyRef({ maxHP: 50, currentHP: 50 }),
          ailments: ["sleep"],
        })
      ),
      "c-1"
    )
    expect(result.ailments[0]?.apply).toEqual({
      field: "currentHP",
      value: 50,
      delta: 5,
    })
  })

  it("gives an enemy Despair no Apply (enemies have no SP)", () => {
    const result = obligations(
      session(combatant({ ref: inlineEnemyRef(), ailments: ["despair"] })),
      "c-1"
    )
    expect(result.ailments).toEqual([{ ailment: "despair", apply: null }])
  })

  it("resolves a catalog-enemy's max HP via the getEnemy fallback", () => {
    const result = obligations(
      session(
        combatant({
          ref: { kind: "catalog-enemy", enemyKey: "goblin" },
          ailments: ["burn"],
        })
      ),
      "c-1"
    )
    expect(result.ailments[0]?.apply).toEqual({
      field: "currentHP",
      value: 36,
      delta: -4,
    })
  })

  it("passes duration ticks and held flags through", () => {
    const result = obligations(
      session(
        combatant({
          conditionDurations: { attack: 2 },
          battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, charged: true },
        })
      ),
      "c-1"
    )
    expect(result.activeDurations).toEqual([{ axis: "attack", turns: 2 }])
    expect(result.heldFlags).toEqual(["charged"])
  })
})

describe("endOfTurnObligations — Frenzy reminder", () => {
  const frenzyMechanic = (pain: number, frenzyMode: boolean) => ({
    "char-1": {
      kind: "frenzy" as const,
      state: { kind: "frenzy" as const, pain, frenzyMode },
    },
  })

  it("reminds to decrement Pain when the PC actor is in Frenzy Mode", () => {
    const result = obligations(
      session(combatant()),
      "c-1",
      frenzyMechanic(3, true)
    )
    expect(result.frenzy).toEqual({ pain: 3 })
  })

  it("is null when the Berserker is not in Frenzy Mode", () => {
    const result = obligations(
      session(combatant()),
      "c-1",
      frenzyMechanic(3, false)
    )
    expect(result.frenzy).toBeNull()
  })

  it("is null when the PC has no active mechanic", () => {
    const result = obligations(session(combatant()), "c-1", { "char-1": null })
    expect(result.frenzy).toBeNull()
  })

  it("is null for an enemy actor", () => {
    const result = obligations(
      session(combatant({ id: "c-1", ref: inlineEnemyRef() })),
      "c-1",
      frenzyMechanic(3, true)
    )
    expect(result.frenzy).toBeNull()
  })

  it("defaults to null when no mechanic map is supplied", () => {
    const result = obligations(session(combatant()), "c-1")
    expect(result.frenzy).toBeNull()
  })
})
