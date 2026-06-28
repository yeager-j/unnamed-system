import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { reduceAilment } from "./ailments"

describe("reduceAilment (R9)", () => {
  it("setAilment adds a key idempotently and preserves order/co-existence (R9.1/R9.2)", () => {
    const session = sessionOf([
      participantWith({ id: "p1", overlay: { ailments: ["burn"] } }),
    ])
    const once = reduceAilment(session, {
      kind: "setAilment",
      participantId: "p1",
      ailment: "freeze",
    })
    expect(once.participants[0]!.overlay.ailments).toEqual(["burn", "freeze"])

    // Idempotent: re-adding an existing key returns the original session (same-ref).
    const again = reduceAilment(once, {
      kind: "setAilment",
      participantId: "p1",
      ailment: "freeze",
    })
    expect(again).toBe(once)
  })

  it("clearAilment removes only the named key; clearing an absent key is harmless (R9.3)", () => {
    const session = sessionOf([
      participantWith({ id: "p1", overlay: { ailments: ["burn", "freeze"] } }),
    ])
    const next = reduceAilment(session, {
      kind: "clearAilment",
      participantId: "p1",
      ailment: "burn",
    })
    expect(next.participants[0]!.overlay.ailments).toEqual(["freeze"])

    const absent = reduceAilment(next, {
      kind: "clearAilment",
      participantId: "p1",
      ailment: "shock",
    })
    expect(absent.participants[0]!.overlay.ailments).toEqual(["freeze"])
  })

  it("is a no-op (same-ref) for an unknown participant id (R9.4)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceAilment(session, {
        kind: "setAilment",
        participantId: "ghost",
        ailment: "burn",
      })
    ).toBe(session)
  })

  it("does not mutate a frozen input (purity)", () => {
    const session = Object.freeze(sessionOf([participantWith({ id: "p1" })]))
    expect(() =>
      reduceAilment(session, {
        kind: "setAilment",
        participantId: "p1",
        ailment: "burn",
      })
    ).not.toThrow()
  })
})
