import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { participantWith, sessionOf } from "../__fixtures__/session"
import type { MechanicTransitionEvent } from "../session-event"
import { reduceMechanicTransition } from "./mechanics"

const event = (
  mechanic: MechanicTransitionEvent["mechanic"],
  transition: unknown,
  participantId = "p1"
): MechanicTransitionEvent => ({
  kind: "mechanicTransition",
  participantId: asParticipantId(participantId),
  mechanic,
  transition,
})

const perfectionParticipant = (rank = 1) =>
  participantWith({
    id: "p1",
    components: {
      mechanics: { states: { perfection: { kind: "perfection", rank } } },
    },
  })

describe("reduceMechanicTransition — guards", () => {
  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([perfectionParticipant()])
    expect(
      reduceMechanicTransition(
        session,
        event("perfection", { op: "adjust", delta: 1 }, "ghost")
      )
    ).toBe(session)
  })

  it("is a no-op (same-ref) when the participant has no Mechanics component", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduceMechanicTransition(
        session,
        event("perfection", { op: "adjust", delta: 1 })
      )
    ).toBe(session)
  })

  it("seeds an absent-but-owned mechanic state from initialState (the UNN-557 read-path mirror)", () => {
    // The component exists but valor has no stored entry — the reducer
    // transitions from the mechanic's initial state, exactly like the Writer's
    // optimistic prediction and the durable commit, so the session arm can't
    // silently drop a write the widget rendered as applicable.
    const session = sessionOf([perfectionParticipant()])
    const next = reduceMechanicTransition(
      session,
      event("valor", { op: "adjust", delta: 1 })
    )
    expect(
      next.participants[0]!.entity.components.mechanics!.states.valor
    ).toEqual({ kind: "valor", value: 1 })
    expect(
      next.participants[0]!.entity.components.mechanics!.states.perfection
    ).toEqual({ kind: "perfection", rank: 1 })
  })

  it("is a no-op (same-ref) for a mechanic with no transitions surface", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        components: {
          mechanics: {
            states: { "thiefs-insight": { kind: "thiefs-insight" } },
          },
        },
      }),
    ])
    expect(reduceMechanicTransition(session, event("thiefs-insight", {}))).toBe(
      session
    )
  })
})

describe("reduceMechanicTransition — applies through the registry", () => {
  it("applies a perfection adjust (clamped by the module's own op)", () => {
    const session = sessionOf([perfectionParticipant(1)])
    const next = reduceMechanicTransition(
      session,
      event("perfection", { op: "adjust", delta: 2 })
    )
    expect(
      next.participants[0]!.entity.components.mechanics!.states.perfection
    ).toEqual({ kind: "perfection", rank: 3 })
    // Purity: the input session is untouched.
    expect(
      session.participants[0]!.entity.components.mechanics!.states.perfection
    ).toEqual({ kind: "perfection", rank: 1 })
  })

  it("applies a perfection reset", () => {
    const session = sessionOf([perfectionParticipant(4)])
    const next = reduceMechanicTransition(
      session,
      event("perfection", { op: "reset" })
    )
    expect(
      next.participants[0]!.entity.components.mechanics!.states.perfection
    ).toEqual({ kind: "perfection", rank: 0 })
  })

  it("applies a frenzy setFrenzyMode through the module's entry guard", () => {
    const session = sessionOf([
      participantWith({
        id: "p1",
        components: {
          mechanics: {
            states: { frenzy: { kind: "frenzy", pain: 2, frenzyMode: false } },
          },
        },
      }),
    ])
    const next = reduceMechanicTransition(
      session,
      event("frenzy", { op: "setFrenzyMode", value: true })
    )
    expect(
      next.participants[0]!.entity.components.mechanics!.states.frenzy
    ).toEqual({ kind: "frenzy", pain: 2, frenzyMode: true })
  })

  it("leaves other mechanics' states and other participants untouched", () => {
    const bystander = participantWith({ id: "p2" })
    const session = sessionOf([perfectionParticipant(1), bystander])
    const next = reduceMechanicTransition(
      session,
      event("perfection", { op: "adjust", delta: 1 })
    )
    expect(next.participants[1]).toBe(session.participants[1])
  })
})
