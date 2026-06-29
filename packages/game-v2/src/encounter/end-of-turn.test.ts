import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { makeScene, type SceneSpec } from "./__fixtures__/session"
import {
  ailmentHpDelta,
  endOfTurnObligations,
  endOfTurnReminders,
  type EndOfTurnObligations,
} from "./end-of-turn"
import { asParticipantId } from "./ids"
import { DEFAULT_BATTLE_CONDITIONS, type OverlayComponents } from "./overlay"
import type { ParticipantView } from "./participant-view"

/** Resolved Vitals read-unit. */
function vit(currentHP: number, maxHP: number): ResolvedEntity["components"] {
  return { vitals: { maxHP, currentHP } }
}

/** Resolved active-mechanic read-unit for a Berserker in (or out of) Frenzy Mode —
 *  the shape `resolveEntity` now surfaces (the capability gate runs there, UNN-525). */
function activeFrenzy(
  pain: number,
  frenzyMode: boolean
): ResolvedEntity["components"] {
  return {
    activeMechanics: [
      { kind: "frenzy", state: { kind: "frenzy", pain, frenzyMode } },
    ],
  }
}

/** The single participant-view of a one-participant scene carrying the given overlay. */
function participantViewFor(
  overlay?: Partial<OverlayComponents>
): ParticipantView {
  return [...makeScene([{ id: "p", overlay }]).view.values()][0]!
}

/** Runs the obligations producer over a fixture scene's resolved view. */
function obligationsFor(
  specs: SceneSpec[],
  actorId: string
): EndOfTurnObligations {
  return endOfTurnObligations(makeScene(specs).view, asParticipantId(actorId))
}

describe("endOfTurnReminders (R14.1 — held flags + active durations)", () => {
  it("returns both empty for a clean participant", () => {
    expect(endOfTurnReminders(participantViewFor())).toEqual({
      heldFlags: [],
      activeDurations: [],
    })
  })

  it("lists held flags in canonical order, only the ones set", () => {
    const reminders = endOfTurnReminders(
      participantViewFor({
        battleConditions: {
          ...DEFAULT_BATTLE_CONDITIONS,
          charged: true,
          concentrating: true,
        },
      })
    )
    expect(reminders.heldFlags).toEqual(["charged", "concentrating"])
  })

  it("lists active durations in canonical axis order, skipping absent axes", () => {
    const reminders = endOfTurnReminders(
      participantViewFor({ conditionDurations: { hitEvasion: 1, attack: 2 } })
    )
    expect(reminders.activeDurations).toEqual([
      { axis: "attack", turns: 2 },
      { axis: "hitEvasion", turns: 1 },
    ])
  })
})

describe("ailmentHpDelta (R14.2 — Burn/Sleep ±10% maxHP, rounded down)", () => {
  it("deals floor(10% maxHP) for Burn and recovers it for Sleep", () => {
    expect(ailmentHpDelta("burn", 55)).toBe(-5)
    expect(ailmentHpDelta("sleep", 55)).toBe(5)
  })

  it("is 0 for Despair (drains SP, never HP) and any other ailment", () => {
    expect(ailmentHpDelta("despair", 100)).toBe(0)
    expect(ailmentHpDelta("freeze", 100)).toBe(0)
  })
})

describe("endOfTurnObligations — ailment HP intents (R14.4 / CD9 SUPERSEDE)", () => {
  it("emits the HP intent for any vitals-bearing participant (PC and enemy alike)", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: vit(30, 50), overlay: { ailments: ["burn"] } }],
      "actor"
    )
    expect(result.ailments).toEqual([
      { ailment: "burn", apply: { delta: -5, value: 25 } },
    ])
  })

  it("clamps a Burn intent's preview value at 0", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: vit(3, 50), overlay: { ailments: ["burn"] } }],
      "actor"
    )
    expect(result.ailments[0]!.apply).toEqual({ delta: -5, value: 0 })
  })

  it("caps a Sleep intent's preview value at maxHP", () => {
    const result = obligationsFor(
      [
        {
          id: "actor",
          resolved: vit(48, 50),
          overlay: { ailments: ["sleep"] },
        },
      ],
      "actor"
    )
    expect(result.ailments[0]!.apply).toEqual({ delta: 5, value: 50 })
  })

  it("nulls the intent for Despair, a non-HP ailment, and a vitals-less participant", () => {
    const despair = obligationsFor(
      [
        {
          id: "actor",
          resolved: vit(30, 50),
          overlay: { ailments: ["despair", "freeze"] },
        },
      ],
      "actor"
    )
    expect(despair.ailments).toEqual([
      { ailment: "despair", apply: null },
      { ailment: "freeze", apply: null },
    ])

    const noVitals = obligationsFor(
      [{ id: "actor", resolved: {}, overlay: { ailments: ["burn"] } }],
      "actor"
    )
    expect(noVitals.ailments).toEqual([{ ailment: "burn", apply: null }])
  })

  it("excludes Downed from the ailment list (it clears at turn start, not via a save)", () => {
    const result = obligationsFor(
      [
        {
          id: "actor",
          resolved: vit(30, 50),
          overlay: { ailments: ["downed", "burn"] },
        },
      ],
      "actor"
    )
    expect(result.ailments.map((a) => a.ailment)).toEqual(["burn"])
  })

  it("passes the duration + held-flag reminders through", () => {
    const result = obligationsFor(
      [
        {
          id: "actor",
          resolved: vit(30, 50),
          overlay: {
            battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, charged: true },
            conditionDurations: { attack: 2 },
          },
        },
      ],
      "actor"
    )
    expect(result.heldFlags).toEqual(["charged"])
    expect(result.activeDurations).toEqual([{ axis: "attack", turns: 2 }])
  })

  it("returns a fully empty result for an unknown actor", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: vit(30, 50), overlay: { ailments: ["burn"] } }],
      "nobody"
    )
    expect(result).toEqual({
      ailments: [],
      activeDurations: [],
      heldFlags: [],
      frenzy: null,
    })
  })
})

describe("endOfTurnObligations — frenzy reminder (R14.5 / CD9 — capability, not kind)", () => {
  it("reports pain-before-decrement when the active mechanic is Frenzy in Frenzy Mode", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: activeFrenzy(3, true) }],
      "actor"
    )
    expect(result.frenzy).toEqual({ pain: 3 })
  })

  it("is null when the Berserker is not in Frenzy Mode", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: activeFrenzy(3, false) }],
      "actor"
    )
    expect(result.frenzy).toBeNull()
  })

  it("is null when the actor carries no active Frenzy mechanic", () => {
    const result = obligationsFor(
      [{ id: "actor", resolved: vit(30, 50) }],
      "actor"
    )
    expect(result.frenzy).toBeNull()
  })
})
