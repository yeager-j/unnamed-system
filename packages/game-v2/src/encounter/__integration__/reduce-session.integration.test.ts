import { describe, expect, it } from "vitest"

import { counterIds, participantWith, sessionOf } from "../__fixtures__/session"
import { createReduceSession } from "../reduce-session"
import type { SessionEvent } from "../session-event"

/**
 * Golden-master + orchestrator integration for the pure session reducer. The
 * golden-master numbers are **genuinely v1-derived**: they were captured by running
 * v1's `reduceCombatSession` over the *same scenario* (translated event-for-event)
 * in a throwaway harness inside `packages/game` (D32 forbids importing v1 here), then
 * committed below as literals. v1 absolute-vitals sets are translated to v2
 * signed-depletion deltas (e.g. v1 `currentHP := 12` on a 20-max enemy → v2
 * `damageParticipant hp 8`), and v1's `hasActedThisRound` flag maps to v2's
 * `turnsTakenThisRound > 0` count.
 */

const reduce = createReduceSession(counterIds())

/** The v1 outcome of {@link SCENARIO}, captured from `reduceCombatSession`. */
const V1 = {
  round: 2,
  currentActorId: null,
  p1: {
    hasActed: false,
    battleConditions: {
      attack: "increased",
      defense: "decreased",
      hitEvasion: "neutral",
      charged: false,
      concentrating: false,
    },
    conditionDurations: { attack: 5, defense: 2 },
    ailments: ["burn"],
    counters: { lumina: 3 },
    moveAvailable: true,
    standardAvailable: false,
    reactionAvailable: true,
  },
  p2: { hasActed: false },
  e1: { currentHP: 18, currentSP: 4, maxHP: 20, maxSP: 10 },
} as const

/** The v2 translation of the v1 scenario the capture ran. */
const SCENARIO: SessionEvent[] = [
  { kind: "startCombat", advantage: "neutral", firstSide: "players" },
  { kind: "draftCombatant", participantId: "p1" },
  {
    kind: "adjustBattleConditionAxis",
    participantId: "p1",
    axis: "attack",
    action: "increase",
  },
  {
    kind: "adjustBattleConditionAxis",
    participantId: "p1",
    axis: "attack",
    action: "increase",
    turns: 3,
  },
  {
    kind: "adjustBattleConditionAxis",
    participantId: "p1",
    axis: "defense",
    action: "decrease",
  },
  { kind: "setAilment", participantId: "p1", ailment: "burn" },
  { kind: "adjustCounter", participantId: "p1", counter: "lumina", delta: 2 },
  { kind: "adjustCounter", participantId: "p1", counter: "lumina", delta: 1 },
  {
    kind: "setActionEconomy",
    participantId: "p1",
    action: "standard",
    available: false,
  },
  { kind: "endTurn" },
  { kind: "draftCombatant", participantId: "p2" },
  { kind: "endTurn" },
  { kind: "advanceRound" },
  // v1 `currentHP := 12` (20 − 8), then `currentSP := 4` (10 − 6), then heal back
  // to `currentHP := 18` (from damage 8, heal 6 → damage 2 → currentHP 18).
  { kind: "damageParticipant", participantId: "e1", pool: "hp", amount: 8 },
  { kind: "damageParticipant", participantId: "e1", pool: "sp", amount: 6 },
  { kind: "healParticipant", participantId: "e1", pool: "hp", amount: 6 },
]

const seed = () =>
  sessionOf([
    participantWith({ id: "p1", side: "players" }),
    participantWith({ id: "p2", side: "players" }),
    participantWith({
      id: "e1",
      side: "enemies",
      components: {
        vitals: { base: 20, damage: 0 },
        skillPool: { base: 10, spSpent: 0 },
      },
    }),
  ])

const currentHP = (v: { base: number; damage: number }) =>
  Math.max(0, v.base - v.damage)
const currentSP = (sp: { base: number; spSpent: number }) =>
  Math.max(0, sp.base - sp.spSpent)

describe("reduce-session — golden master vs v1", () => {
  const final = SCENARIO.reduce(reduce, seed())
  const p1 = final.participants.find((p) => p.id === "p1")!
  const p2 = final.participants.find((p) => p.id === "p2")!
  const e1 = final.participants.find((p) => p.id === "e1")!

  it("reproduces the v1 session scalars", () => {
    expect(final.round).toBe(V1.round)
    expect(final.currentActorId).toBe(V1.currentActorId)
  })

  it("reproduces p1's overlay (conditions, durations, ailments, counters)", () => {
    expect(p1.overlay.battleConditions).toEqual(V1.p1.battleConditions)
    expect(p1.overlay.conditionDurations).toEqual(V1.p1.conditionDurations)
    expect(p1.overlay.ailments).toEqual(V1.p1.ailments)
    expect(p1.overlay.counters).toEqual(V1.p1.counters)
  })

  it("reproduces the acted-flags as turnsTakenThisRound counts", () => {
    expect(p1.overlay.turnState.turnsTakenThisRound > 0).toBe(V1.p1.hasActed)
    expect(p2.overlay.turnState.turnsTakenThisRound > 0).toBe(V1.p2.hasActed)
  })

  it("reproduces p1's action availability as consumption (used = available ? 0 : 1)", () => {
    expect(p1.overlay.turnState.movesUsed === 0).toBe(V1.p1.moveAvailable)
    expect(p1.overlay.turnState.standardsUsed === 0).toBe(
      V1.p1.standardAvailable
    )
    expect(p1.overlay.turnState.reactionsUsed === 0).toBe(
      V1.p1.reactionAvailable
    )
  })

  it("reproduces the enemy's working vitals via signed depletion", () => {
    const v = e1.entity.components.vitals!
    const sp = e1.entity.components.skillPool!
    expect(currentHP(v)).toBe(V1.e1.currentHP)
    expect(currentSP(sp)).toBe(V1.e1.currentSP)
    // The honest maxima are untouched (depletion model, not absolute sets).
    expect(v.base).toBe(V1.e1.maxHP)
    expect(sp.base).toBe(V1.e1.maxSP)
  })
})

describe("reduce-session — orchestrator dispatch (families outside the scenario)", () => {
  const mint = counterIds("joined")
  const reduceWith = createReduceSession(mint)
  const base = () =>
    sessionOf([participantWith({ id: "p1", side: "players" })], {
      currentActorId: "p1",
    })

  it("routes addParticipant → roster (mints + queues a joiner)", () => {
    const next = reduceWith(base(), {
      kind: "addParticipant",
      setup: { side: "enemies", entity: { id: "e", components: {} } },
    })
    expect(next.participants).toHaveLength(2)
    expect(next.participants[1]!.overlay.turnState.turnsTakenThisRound).toBe(1)
  })

  it("routes removeParticipant → roster (drops + nulls actor)", () => {
    const next = reduceWith(base(), {
      kind: "removeParticipant",
      participantId: "p1",
    })
    expect(next.participants).toHaveLength(0)
    expect(next.currentActorId).toBeNull()
  })

  it("routes setSide / setCurrentActor / setRound / clears / flag", () => {
    expect(
      reduceWith(base(), {
        kind: "setSide",
        participantId: "p1",
        side: "enemies",
      }).participants[0]!.overlay.allegiance.side
    ).toBe("enemies")
    expect(
      reduceWith(base(), { kind: "setCurrentActor", participantId: "z" })
        .currentActorId
    ).toBe("z")
    expect(reduceWith(base(), { kind: "setRound", round: 9 }).round).toBe(9)
    expect(
      reduceWith(
        sessionOf([
          participantWith({ id: "p1", overlay: { ailments: ["burn"] } }),
        ]),
        { kind: "clearAilment", participantId: "p1", ailment: "burn" }
      ).participants[0]!.overlay.ailments
    ).toEqual([])
    expect(
      reduceWith(base(), {
        kind: "setBattleConditionFlag",
        participantId: "p1",
        flag: "concentrating",
        value: true,
      }).participants[0]!.overlay.battleConditions.concentrating
    ).toBe(true)
  })
})

describe("reduce-session — cross-cutting invariants (R24)", () => {
  it("propagates same-ref on a no-op event through the orchestrator (R24.1)", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      reduce(session, { kind: "draftCombatant", participantId: "ghost" })
    ).toBe(session)
    expect(reduce(session, { kind: "endTurn" })).toBe(session)
  })

  it("never reads or writes mapInstanceId — it survives every event kind (R24.5)", () => {
    const withMap = sessionOf([participantWith({ id: "p1" })], {
      mapInstanceId: "map-1",
      currentActorId: "p1",
    })
    const events: SessionEvent[] = [
      { kind: "advanceRound" },
      { kind: "endTurn" },
      { kind: "setRound", round: 3 },
      { kind: "setAilment", participantId: "p1", ailment: "burn" },
      { kind: "damageParticipant", participantId: "p1", pool: "hp", amount: 1 },
    ]
    for (const event of events) {
      expect(reduce(withMap, event).mapInstanceId).toBe("map-1")
    }
  })
})

describe("reduce-session — setParticipantMax SUPERSEDES v1's current-drag (R12.2)", () => {
  it("writes base and lets current re-derive against existing damage (no min-clamp)", () => {
    // v1 `maxHP := 10` on a 15/20 enemy DRAGS current to 10. v2 instead writes base
    // and re-derives: damage 5 stays, so currentHP = max(0, 10 − 5) = 5 (CD6/D9).
    const session = sessionOf([
      participantWith({
        id: "e1",
        side: "enemies",
        components: { vitals: { base: 20, damage: 5 } },
      }),
    ])
    const next = reduce(session, {
      kind: "setParticipantMax",
      participantId: "e1",
      pool: "hp",
      amount: 10,
    })
    const v = next.participants[0]!.entity.components.vitals!
    expect(v.base).toBe(10)
    expect(v.damage).toBe(5)
    expect(currentHP(v)).toBe(5)
  })
})
