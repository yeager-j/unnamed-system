import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { reduceOverride } from "./override"

describe("reduceOverride — setCurrentActor (R7.1)", () => {
  it("writes currentActorId unconditionally, even for an unknown id", () => {
    const session = sessionOf([participantWith({ id: "p1" })], {
      currentActorId: "p1",
    })
    const next = reduceOverride(session, {
      kind: "setCurrentActor",
      participantId: "ghost",
    })
    expect(next.currentActorId).toBe("ghost")
  })
})

describe("reduceOverride — setActed (R7.2 → turnsTakenThisRound)", () => {
  it("maps hasActed=true to turnsTakenThisRound=1", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceOverride(session, {
      kind: "setActed",
      participantId: "p1",
      hasActed: true,
    })
    expect(next.participants[0]!.overlay.turnState.turnsTakenThisRound).toBe(1)
  })

  it("maps hasActed=false to turnsTakenThisRound=0", () => {
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
    const next = reduceOverride(session, {
      kind: "setActed",
      participantId: "p1",
      hasActed: false,
    })
    expect(next.participants[0]!.overlay.turnState.turnsTakenThisRound).toBe(0)
  })

  it("is a no-op (same-ref) for an unknown id (contrast setCurrentActor)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceOverride(session, {
        kind: "setActed",
        participantId: "ghost",
        hasActed: true,
      })
    ).toBe(session)
  })
})

describe("reduceOverride — setRound (R7.3)", () => {
  it("sets round without clamping or touching any participant", () => {
    const session = sessionOf([participantWith({ id: "p1" })], { round: 4 })
    const next = reduceOverride(session, { kind: "setRound", round: 1 })
    expect(next.round).toBe(1)
    expect(next.participants[0]).toBe(session.participants[0])
  })
})
