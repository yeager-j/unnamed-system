import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import type { BattleConditionEvent } from "../session-event"
import { reduceBattleCondition } from "./conditions"

const axis = (
  participantId: string,
  action: "increase" | "decrease" | "clear",
  turns?: number
): BattleConditionEvent => ({
  kind: "adjustBattleConditionAxis",
  participantId,
  axis: "attack",
  action,
  ...(turns !== undefined && { turns }),
})

describe("reduceBattleCondition — axis (R8.1–R8.4)", () => {
  it("increase sets the axis increased and starts a default 3-turn clock (R8.1)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceBattleCondition(session, axis("p1", "increase"))
    expect(next.participants[0]!.overlay.battleConditions.attack).toBe(
      "increased"
    )
    expect(next.participants[0]!.overlay.conditionDurations.attack).toBe(3)
  })

  it("re-applying the SAME direction extends the clock, not the magnitude (R8.2)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          battleConditions: {
            attack: "increased",
            defense: "neutral",
            hitEvasion: "neutral",
            charged: false,
            concentrating: false,
          },
          conditionDurations: { attack: 3 },
        },
      }),
    ])
    const next = reduceBattleCondition(session, axis("p1", "increase", 3))
    expect(next.participants[0]!.overlay.battleConditions.attack).toBe(
      "increased"
    )
    expect(next.participants[0]!.overlay.conditionDurations.attack).toBe(6)
  })

  it("flipping direction resets the clock and sets the new state (R8.3)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          battleConditions: {
            attack: "increased",
            defense: "neutral",
            hitEvasion: "neutral",
            charged: false,
            concentrating: false,
          },
          conditionDurations: { attack: 5 },
        },
      }),
    ])
    const next = reduceBattleCondition(session, axis("p1", "decrease", 3))
    expect(next.participants[0]!.overlay.battleConditions.attack).toBe(
      "decreased"
    )
    expect(next.participants[0]!.overlay.conditionDurations.attack).toBe(3)
  })

  it("clear returns the axis to neutral and drops its duration (R8.4)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          battleConditions: {
            attack: "increased",
            defense: "neutral",
            hitEvasion: "neutral",
            charged: false,
            concentrating: false,
          },
          conditionDurations: { attack: 2 },
        },
      }),
    ])
    const next = reduceBattleCondition(session, axis("p1", "clear"))
    expect(next.participants[0]!.overlay.battleConditions.attack).toBe(
      "neutral"
    )
    expect(next.participants[0]!.overlay.conditionDurations).toEqual({})
  })
})

describe("reduceBattleCondition — flag (R8.5) + unknown id (R8.6)", () => {
  it("toggles a single-use flag on or off as given", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceBattleCondition(session, {
      kind: "setBattleConditionFlag",
      participantId: "p1",
      flag: "charged",
      value: true,
    })
    expect(next.participants[0]!.overlay.battleConditions.charged).toBe(true)
  })

  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(reduceBattleCondition(session, axis("ghost", "increase"))).toBe(
      session
    )
  })
})
