import { describe, expect, it } from "vitest"

import {
  combatEventSchema,
  toSessionEvent,
  type CombatEvent,
  type ComponentWriteEvent,
} from "./session-event"

/**
 * The structural-ephemeral-only contract (CD19): the router-only
 * {@link ComponentWriteEvent} family is **unrepresentable** on the generic wire,
 * so a durable/vitals target can never arrive over {@link combatEventSchema}. The
 * sole mint path is {@link toSessionEvent}.
 */

const COMPONENT_WRITE_KINDS: ComponentWriteEvent["kind"][] = [
  "damageParticipant",
  "healParticipant",
  "setParticipantMax",
]

/** One valid payload per generic-wire kind (the 17 the schema must accept). */
const GENERIC_EVENTS: CombatEvent[] = [
  { kind: "startCombat", advantage: "neutral", firstSide: "players" },
  { kind: "draftCombatant", participantId: "p1" },
  { kind: "endTurn" },
  { kind: "advanceRound" },
  {
    kind: "addParticipant",
    setup: {
      side: "players",
      entity: { id: "e", components: { vitals: { base: 10, damage: 0 } } },
    },
  },
  { kind: "removeParticipant", participantId: "p1" },
  { kind: "setSide", participantId: "p1", side: "enemies" },
  { kind: "setCurrentActor", participantId: "p1" },
  { kind: "setActed", participantId: "p1", hasActed: true },
  { kind: "setRound", round: 2 },
  {
    kind: "adjustBattleConditionAxis",
    participantId: "p1",
    axis: "attack",
    action: "increase",
  },
  {
    kind: "setBattleConditionFlag",
    participantId: "p1",
    flag: "charged",
    value: true,
  },
  { kind: "setAilment", participantId: "p1", ailment: "burn" },
  { kind: "clearAilment", participantId: "p1", ailment: "burn" },
  { kind: "adjustCounter", participantId: "p1", counter: "lumina", delta: 1 },
  { kind: "clearCounter", participantId: "p1", counter: "lumina" },
  {
    kind: "adjustActionEconomy",
    participantId: "p1",
    action: "move",
    delta: 1,
  },
]

describe("combatEventSchema — accepts the generic wire", () => {
  it.each(GENERIC_EVENTS.map((event) => [event.kind, event] as const))(
    "accepts %s",
    (_kind, event) => {
      expect(combatEventSchema.safeParse(event).success).toBe(true)
    }
  )

  it("validates an addParticipant entity through the loadEntity seam (rejects a bad component blob)", () => {
    const bad = {
      kind: "addParticipant",
      setup: {
        side: "players",
        entity: { id: "e", components: { vitals: { base: "not-a-number" } } },
      },
    }
    expect(combatEventSchema.safeParse(bad).success).toBe(false)
  })
})

describe("combatEventSchema — excludes ComponentWriteEvent (the wire-exclusion)", () => {
  it.each(COMPONENT_WRITE_KINDS)("rejects %s on the generic wire", (kind) => {
    const event = { kind, participantId: "p1", pool: "hp", amount: 5 }
    expect(combatEventSchema.safeParse(event).success).toBe(false)
  })
})

describe("toSessionEvent — the sole ComponentWriteEvent constructor", () => {
  it("maps component → pool and op → kind", () => {
    expect(
      toSessionEvent({
        participantId: "p1",
        component: "skillPool",
        op: "damage",
        amount: 3,
      })
    ).toEqual({
      kind: "damageParticipant",
      participantId: "p1",
      pool: "sp",
      amount: 3,
    })
    expect(
      toSessionEvent({
        participantId: "p2",
        component: "vitals",
        op: "setMax",
        amount: 10,
      })
    ).toEqual({
      kind: "setParticipantMax",
      participantId: "p2",
      pool: "hp",
      amount: 10,
    })
  })

  it("produces an event the generic wire rejects (so it cannot round-trip onto it)", () => {
    const event = toSessionEvent({
      participantId: "p1",
      component: "vitals",
      op: "heal",
      amount: 4,
    })
    expect(combatEventSchema.safeParse(event).success).toBe(false)
  })
})
