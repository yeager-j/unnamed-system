import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { combatEventSchema, type CombatEvent } from "./session-event"

const p1 = asParticipantId("p1")

/**
 * The structural-ephemeral-only contract (CD19): the router-only
 * {@link ComponentWriteEvent} family is **unrepresentable** on the generic wire,
 * so a durable/vitals target can never arrive over {@link combatEventSchema}. The
 * sole mint path is {@link toSessionEvent}.
 */

const RETIRED_COMPONENT_WRITE_KINDS = [
  "damageParticipant",
  "healParticipant",
  "setParticipantMax",
] as const

/** One valid payload per generic-wire kind (the 17 the schema must accept). */
const GENERIC_EVENTS: CombatEvent[] = [
  { kind: "startCombat", advantage: "neutral", firstSide: "players" },
  { kind: "draftCombatant", participantId: p1 },
  { kind: "endTurn" },
  { kind: "advanceRound" },
  {
    kind: "addParticipant",
    setup: {
      side: "players",
      entity: { id: "e", components: { vitals: { base: 10, damage: 0 } } },
    },
  },
  { kind: "removeParticipant", participantId: p1 },
  { kind: "setSide", participantId: p1, side: "enemies" },
  { kind: "setCurrentActor", participantId: p1 },
  { kind: "setActed", participantId: p1, hasActed: true },
  { kind: "setRound", round: 2 },
  {
    kind: "adjustBattleConditionAxis",
    participantId: p1,
    axis: "attack",
    action: "increase",
  },
  {
    kind: "setBattleConditionFlag",
    participantId: p1,
    flag: "charged",
    value: true,
  },
  { kind: "setAilment", participantId: p1, ailment: "burn" },
  { kind: "clearAilment", participantId: p1, ailment: "burn" },
  { kind: "adjustCounter", participantId: p1, counter: "lumina", delta: 1 },
  { kind: "clearCounter", participantId: p1, counter: "lumina" },
  {
    kind: "adjustActionEconomy",
    participantId: p1,
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
  it.each(RETIRED_COMPONENT_WRITE_KINDS)(
    "rejects %s on the generic wire",
    (kind) => {
      const event = { kind, participantId: "p1", pool: "hp", amount: 5 }
      expect(combatEventSchema.safeParse(event).success).toBe(false)
    }
  )
})
