import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import type { StartCombatEvent } from "../session-event"
import { reduceStartCombat } from "./start-combat"

const start = (
  advantage: StartCombatEvent["advantage"],
  firstSide: StartCombatEvent["firstSide"]
): StartCombatEvent => ({ kind: "startCombat", advantage, firstSide })

describe("reduceStartCombat (R2)", () => {
  it("records advantage + firstSide verbatim, with no normalisation (R2.1)", () => {
    // A non-neutral advantage paired with a mismatched firstSide is recorded as-is.
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceStartCombat(session, start("players", "enemies"))
    expect(next.advantage).toBe("players")
    expect(next.firstSide).toBe("enemies")
  })

  it("records firstSide even under neutral advantage (R2.1 edge)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceStartCombat(session, start("neutral", "players"))
    expect(next.advantage).toBe("neutral")
    expect(next.firstSide).toBe("players")
  })

  it("opens round 1 cleanly: nulls the actor + resets every turnsTakenThisRound (R2.3)", () => {
    const session = sessionOf(
      [
        participantWith({
          id: "p1",
          overlay: { turnState: turnState({ turnsTakenThisRound: 1 }) },
        }),
        participantWith({
          id: "p2",
          overlay: { turnState: turnState({ turnsTakenThisRound: 1 }) },
        }),
      ],
      { currentActorId: "p1" }
    )
    const next = reduceStartCombat(session, start("neutral", "players"))
    expect(next.currentActorId).toBeNull()
    expect(
      next.participants.map((p) => p.overlay.turnState.turnsTakenThisRound)
    ).toEqual([0, 0])
  })

  it("is a no-op (same-ref) once advantage is non-null — cannot start twice (R2.2)", () => {
    const session = sessionOf([participantWith({ id: "p1" })], {
      advantage: "neutral",
      firstSide: "players",
    })
    expect(reduceStartCombat(session, start("players", "enemies"))).toBe(
      session
    )
  })
})

function turnState(over: Partial<{ turnsTakenThisRound: number }>) {
  return {
    movesUsed: 0,
    standardsUsed: 0,
    reactionsUsed: 0,
    turnsTakenThisRound: over.turnsTakenThisRound ?? 0,
  }
}
