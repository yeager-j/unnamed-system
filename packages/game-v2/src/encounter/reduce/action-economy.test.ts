import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { reduceActionEconomy } from "./action-economy"

describe("reduceActionEconomy (R11.1 → consumption)", () => {
  it("maps available=false to used=1 against the base budget of 1", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = reduceActionEconomy(session, {
      kind: "setActionEconomy",
      participantId: "p1",
      action: "standard",
      available: false,
    })
    expect(next.participants[0]!.overlay.turnState.standardsUsed).toBe(1)
  })

  it("maps available=true to used=0, touching only the named action", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: {
          turnState: {
            movesUsed: 1,
            standardsUsed: 1,
            reactionsUsed: 1,
            turnsTakenThisRound: 0,
          },
        },
      }),
    ])
    const next = reduceActionEconomy(session, {
      kind: "setActionEconomy",
      participantId: "p1",
      action: "move",
      available: true,
    })
    const ts = next.participants[0]!.overlay.turnState
    expect(ts.movesUsed).toBe(0)
    expect(ts.standardsUsed).toBe(1)
    expect(ts.reactionsUsed).toBe(1)
  })

  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceActionEconomy(session, {
        kind: "setActionEconomy",
        participantId: "ghost",
        action: "reaction",
        available: false,
      })
    ).toBe(session)
  })
})
