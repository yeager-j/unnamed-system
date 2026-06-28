import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { reduceTurn } from "./turn"

describe("reduceTurn — endTurn (R5)", () => {
  it("increments the actual current actor's turnsTakenThisRound, keeping them current (R5.1)", () => {
    const session = sessionOf(
      [participantWith({ id: "p1" }), participantWith({ id: "p2" })],
      { currentActorId: "p2" }
    )
    const next = reduceTurn(session)
    expect(next.currentActorId).toBe("p2")
    expect(next.participants[1]!.overlay.turnState.turnsTakenThisRound).toBe(1)
    expect(next.participants[0]!.overlay.turnState.turnsTakenThisRound).toBe(0)
  })

  it("ticks ONLY the acting actor's durations: >1 decrements, ≤1 expires to neutral + drops (R5.2)", () => {
    const session = sessionOf(
      [
        participantWith({
          id: "actor",
          overlay: {
            battleConditions: {
              attack: "increased",
              defense: "decreased",
              hitEvasion: "neutral",
              charged: false,
              concentrating: false,
            },
            conditionDurations: { attack: 3, defense: 1 },
          },
        }),
        participantWith({
          id: "bystander",
          overlay: { conditionDurations: { attack: 2 } },
        }),
      ],
      { currentActorId: "actor" }
    )
    const next = reduceTurn(session)
    const actor = next.participants[0]!
    // attack 3 → 2 (decrement, state kept); defense 1 → expired (dropped + neutral).
    expect(actor.overlay.conditionDurations).toEqual({ attack: 2 })
    expect(actor.overlay.battleConditions.attack).toBe("increased")
    expect(actor.overlay.battleConditions.defense).toBe("neutral")
    // The bystander's durations are untouched.
    expect(next.participants[1]!.overlay.conditionDurations).toEqual({
      attack: 2,
    })
  })

  it("leaves an axis with no duration entry untouched even if non-neutral (R5.2 edge)", () => {
    const session = sessionOf(
      [
        participantWith({
          id: "actor",
          overlay: {
            battleConditions: {
              attack: "increased",
              defense: "neutral",
              hitEvasion: "neutral",
              charged: false,
              concentrating: false,
            },
            conditionDurations: {},
          },
        }),
      ],
      { currentActorId: "actor" }
    )
    const next = reduceTurn(session)
    expect(next.participants[0]!.overlay.battleConditions.attack).toBe(
      "increased"
    )
  })

  it("is a no-op (same-ref) when there is no current actor (R5.3)", () => {
    const session = sessionOf([participantWith({ id: "p1" })], {
      currentActorId: null,
    })
    expect(reduceTurn(session)).toBe(session)
  })

  it("is a no-op (same-ref) when the current actor id matches no participant (R5.3)", () => {
    const session = sessionOf([participantWith({ id: "p1" })], {
      currentActorId: "ghost",
    })
    expect(reduceTurn(session)).toBe(session)
  })
})
