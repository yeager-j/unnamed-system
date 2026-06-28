import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { reduceDraft } from "./draft"

const draft = (participantId: string) =>
  ({ kind: "draftCombatant", participantId }) as const

describe("reduceDraft (R4)", () => {
  it("sets the actor, resets consumption to zero, clears Downed but keeps other ailments (R4.1)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          ailments: ["downed", "burn"],
          turnState: {
            movesUsed: 1,
            standardsUsed: 1,
            reactionsUsed: 1,
            turnsTakenThisRound: 1,
          },
        },
      }),
    ])
    const next = reduceDraft(session, draft("p1"))
    const p = next.participants[0]!
    expect(next.currentActorId).toBe("p1")
    expect(p.overlay.turnState.movesUsed).toBe(0)
    expect(p.overlay.turnState.standardsUsed).toBe(0)
    expect(p.overlay.turnState.reactionsUsed).toBe(0)
    expect(p.overlay.ailments).toEqual(["burn"])
  })

  it("does NOT touch turnsTakenThisRound (that is endTurn's job, R4.1)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          turnState: {
            movesUsed: 0,
            standardsUsed: 0,
            reactionsUsed: 0,
            turnsTakenThisRound: 1,
          },
        },
      }),
    ])
    const next = reduceDraft(session, draft("p1"))
    expect(next.participants[0]!.overlay.turnState.turnsTakenThisRound).toBe(1)
  })

  it("is a no-op (same-ref) for an unknown participant id (R4.2)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(reduceDraft(session, draft("ghost"))).toBe(session)
  })
})
