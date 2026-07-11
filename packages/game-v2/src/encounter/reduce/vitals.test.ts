import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { participantWith, sessionOf } from "../__fixtures__/session"
import type { ComponentWriteEvent } from "../session-event"
import { reduceVitals } from "./vitals"

const vit = (
  kind: ComponentWriteEvent["kind"],
  pool: ComponentWriteEvent["pool"],
  amount: number,
  participantId = "p1"
): ComponentWriteEvent => ({
  kind,
  participantId: asParticipantId(participantId),
  pool,
  amount,
})

const hpParticipant = (damage = 0) =>
  participantWith({ id: "p1", components: { vitals: { base: 20, damage } } })

const spParticipant = (spSpent = 0) =>
  participantWith({
    id: "p1",
    components: {
      vitals: { base: 20, damage: 0 },
      skillPool: { base: 10, spSpent },
    },
  })

describe("reduceVitals — guards (R12.4)", () => {
  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([hpParticipant()])
    expect(
      reduceVitals(session, vit("damageParticipant", "hp", 5, "ghost"))
    ).toBe(session)
  })

  it("no-ops (same-ref) an sp write on a participant lacking a skillPool (capability absence)", () => {
    const session = sessionOf([hpParticipant()]) // vitals only, no skillPool
    expect(reduceVitals(session, vit("damageParticipant", "sp", 4))).toBe(
      session
    )
  })

  it("no-ops (same-ref) an hp write on a participant lacking vitals", () => {
    const session = sessionOf([participantWith({ id: "p1", components: {} })])
    expect(reduceVitals(session, vit("damageParticipant", "hp", 4))).toBe(
      session
    )
  })

  it("no-ops (same-ref) a malformed amount (the op's invalid-input backstop, UNN-565)", () => {
    const session = sessionOf([hpParticipant(3)])
    expect(reduceVitals(session, vit("damageParticipant", "hp", 1.5))).toBe(
      session
    )
    expect(reduceVitals(session, vit("healParticipant", "hp", NaN))).toBe(
      session
    )
  })
})

describe("reduceVitals — HP (signed depletion, CD6)", () => {
  it("damageParticipant adds to stored damage (overkill keeps true magnitude)", () => {
    const session = sessionOf([hpParticipant(0)])
    const next = reduceVitals(session, vit("damageParticipant", "hp", 25))
    // Stored damage 25 over a base of 20 → resolve floors currentHP at 0 later.
    expect(next.participants[0]!.entity.components.vitals!.damage).toBe(25)
  })

  it("damageParticipant with a negative amount floats over-max (negative damage = Usury loan)", () => {
    const session = sessionOf([hpParticipant(0)])
    const next = reduceVitals(session, vit("damageParticipant", "hp", -5))
    expect(next.participants[0]!.entity.components.vitals!.damage).toBe(-5)
  })

  it("healParticipant reduces damage floored at 0 (no overheal)", () => {
    const session = sessionOf([hpParticipant(8)])
    const next = reduceVitals(session, vit("healParticipant", "hp", 100))
    expect(next.participants[0]!.entity.components.vitals!.damage).toBe(0)
  })

  it("healParticipant no-ops over-max (preserves a negative-damage loan)", () => {
    const session = sessionOf([hpParticipant(-5)])
    const next = reduceVitals(session, vit("healParticipant", "hp", 3))
    expect(next.participants[0]!.entity.components.vitals!.damage).toBe(-5)
  })

  it("setParticipantMax writes base (effective max re-derives at resolve, no current-drag)", () => {
    const session = sessionOf([hpParticipant(5)])
    const next = reduceVitals(session, vit("setParticipantMax", "hp", 10))
    expect(next.participants[0]!.entity.components.vitals!.base).toBe(10)
    // damage is untouched — current re-derives as max(0, 10 − 5) = 5 at resolve.
    expect(next.participants[0]!.entity.components.vitals!.damage).toBe(5)
  })
})

describe("reduceVitals — SP (spend/recover)", () => {
  it("damageParticipant spends SP (spSpent grows)", () => {
    const session = sessionOf([spParticipant(2)])
    const next = reduceVitals(session, vit("damageParticipant", "sp", 3))
    expect(next.participants[0]!.entity.components.skillPool!.spSpent).toBe(5)
  })

  it("healParticipant recovers SP, floored at 0 (no over-recovery)", () => {
    const session = sessionOf([spParticipant(2)])
    const next = reduceVitals(session, vit("healParticipant", "sp", 10))
    expect(next.participants[0]!.entity.components.skillPool!.spSpent).toBe(0)
  })

  it("setParticipantMax writes the skillPool base", () => {
    const session = sessionOf([spParticipant(0)])
    const next = reduceVitals(session, vit("setParticipantMax", "sp", 14))
    expect(next.participants[0]!.entity.components.skillPool!.base).toBe(14)
  })
})
