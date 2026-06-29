import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { asParticipantId } from "../ids"
import { reduceActionEconomy } from "./action-economy"

describe("reduceActionEconomy (R11 → signed-delta consumption)", () => {
  it("adds a positive delta, consuming one of the named action (used 0 → 1)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceActionEconomy(session, {
      kind: "adjustActionEconomy",
      participantId: asParticipantId("p1"),
      action: "standard",
      delta: 1,
    })
    expect(next.participants[0]!.overlay.turnState.standardsUsed).toBe(1)
  })

  it("adds a negative delta, freeing one of the named action (used 1 → 0)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          turnState: {
            movesUsed: 0,
            standardsUsed: 1,
            reactionsUsed: 0,
            turnsTakenThisRound: 0,
          },
        },
      }),
    ])
    const next = reduceActionEconomy(session, {
      kind: "adjustActionEconomy",
      participantId: asParticipantId("p1"),
      action: "standard",
      delta: -1,
    })
    expect(next.participants[0]!.overlay.turnState.standardsUsed).toBe(0)
  })

  it("is unbounded above — two increments stack to a multi-action used count", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const once = reduceActionEconomy(session, {
      kind: "adjustActionEconomy",
      participantId: asParticipantId("p1"),
      action: "move",
      delta: 1,
    })
    const twice = reduceActionEconomy(once, {
      kind: "adjustActionEconomy",
      participantId: asParticipantId("p1"),
      action: "move",
      delta: 1,
    })
    expect(twice.participants[0]!.overlay.turnState.movesUsed).toBe(2)
  })

  it("floors at 0 — a decrement on an already-0 field is a same-ref no-op", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceActionEconomy(session, {
        kind: "adjustActionEconomy",
        participantId: asParticipantId("p1"),
        action: "reaction",
        delta: -1,
      })
    ).toBe(session)
  })

  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceActionEconomy(session, {
        kind: "adjustActionEconomy",
        participantId: asParticipantId("ghost"),
        action: "reaction",
        delta: 1,
      })
    ).toBe(session)
  })
})
