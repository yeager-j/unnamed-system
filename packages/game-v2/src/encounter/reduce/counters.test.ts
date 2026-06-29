import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "../__fixtures__/session"
import { asParticipantId } from "../ids"
import { reduceCounter } from "./counters"

describe("reduceCounter (R10)", () => {
  it("adjustCounter adds a signed delta (absent ⇒ 0), merging against the loaded session (R10.1)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const up = reduceCounter(session, {
      kind: "adjustCounter",
      participantId: asParticipantId("p1"),
      counter: "lumina",
      delta: 2,
    })
    expect(up.participants[0]!.overlay.counters.lumina).toBe(2)
    const more = reduceCounter(up, {
      kind: "adjustCounter",
      participantId: asParticipantId("p1"),
      counter: "lumina",
      delta: 1,
    })
    expect(more.participants[0]!.overlay.counters.lumina).toBe(3)
  })

  it("floors at 0 and DELETES the key at 0, incl. negative overshoot (R10.2)", () => {
    const session = sessionOf([
      participantWith({ id: "p1", overlay: { counters: { lumina: 2 } } }),
    ])
    const next = reduceCounter(session, {
      kind: "adjustCounter",
      participantId: asParticipantId("p1"),
      counter: "lumina",
      delta: -5,
    })
    expect(next.participants[0]!.overlay.counters).toEqual({})
  })

  it("clearCounter removes the counter outright (R10.3)", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        overlay: { counters: { lumina: 3, tells: 1 } },
      }),
    ])
    const next = reduceCounter(session, {
      kind: "clearCounter",
      participantId: asParticipantId("p1"),
      counter: "lumina",
    })
    expect(next.participants[0]!.overlay.counters).toEqual({ tells: 1 })
  })

  it("is a no-op (same-ref) for an unknown participant id (R10.4)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceCounter(session, {
        kind: "adjustCounter",
        participantId: asParticipantId("ghost"),
        counter: "lumina",
        delta: 1,
      })
    ).toBe(session)
  })
})
