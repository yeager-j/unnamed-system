import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

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
} as const

/** The v2 translation of the v1 scenario the capture ran. */
const SCENARIO: SessionEvent[] = [
  { kind: "startCombat", advantage: "neutral", firstSide: "players" },
  { kind: "draftCombatant", participantId: asParticipantId("p1") },
  {
    kind: "adjustBattleConditionAxis",
    participantId: asParticipantId("p1"),
    axis: "attack",
    action: "increase",
  },
  {
    kind: "adjustBattleConditionAxis",
    participantId: asParticipantId("p1"),
    axis: "attack",
    action: "increase",
    turns: 3,
  },
  {
    kind: "adjustBattleConditionAxis",
    participantId: asParticipantId("p1"),
    axis: "defense",
    action: "decrease",
  },
  { kind: "setAilment", participantId: asParticipantId("p1"), ailment: "burn" },
  {
    kind: "adjustCounter",
    participantId: asParticipantId("p1"),
    counter: "lumina",
    delta: 2,
  },
  {
    kind: "adjustCounter",
    participantId: asParticipantId("p1"),
    counter: "lumina",
    delta: 1,
  },
  {
    kind: "adjustActionEconomy",
    participantId: asParticipantId("p1"),
    action: "standard",
    delta: 1,
  },
  { kind: "endTurn" },
  { kind: "draftCombatant", participantId: asParticipantId("p2") },
  { kind: "endTurn" },
  { kind: "advanceRound" },
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

describe("reduce-session — golden master vs v1", () => {
  const final = SCENARIO.reduce(reduce, seed())
  const p1 = final.participants.find((p) => p.id === "p1")!
  const p2 = final.participants.find((p) => p.id === "p2")!

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
      participantId: asParticipantId("p1"),
    })
    expect(next.participants).toHaveLength(0)
    expect(next.currentActorId).toBeNull()
  })

  it("routes desired writes and leaves an unknown current actor unchanged", () => {
    expect(
      reduceWith(base(), {
        kind: "setSide",
        participantId: asParticipantId("p1"),
        side: "enemies",
      }).participants[0]!.overlay.allegiance.side
    ).toBe("enemies")
    expect(
      reduceWith(base(), {
        kind: "setCurrentActor",
        participantId: asParticipantId("z"),
      }).currentActorId
    ).toBe("p1")
    expect(reduceWith(base(), { kind: "setRound", round: 9 }).round).toBe(9)
    expect(
      reduceWith(
        sessionOf([
          participantWith({ id: "p1", overlay: { ailments: ["burn"] } }),
        ]),
        {
          kind: "clearAilment",
          participantId: asParticipantId("p1"),
          ailment: "burn",
        }
      ).participants[0]!.overlay.ailments
    ).toEqual([])
    expect(
      reduceWith(base(), {
        kind: "setBattleConditionFlag",
        participantId: asParticipantId("p1"),
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
      reduce(session, {
        kind: "draftCombatant",
        participantId: asParticipantId("ghost"),
      })
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
      {
        kind: "setAilment",
        participantId: asParticipantId("p1"),
        ailment: "burn",
      },
    ]
    for (const event of events) {
      expect(reduce(withMap, event).mapInstanceId).toBe("map-1")
    }
  })
})
