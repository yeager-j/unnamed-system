import { describe, expect, it } from "vitest"

import {
  makeParticipant,
  type EncounterState,
  type Session,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import { createReduceConsoleOptimistic } from "./console-optimistic"

const goblinId = asParticipantId("p-goblin")

function goblinEntity(): Entity {
  return {
    id: "e-goblin",
    components: {
      identity: { name: "Goblin" },
      vitals: { base: 20, damage: 0 },
    },
  }
}

function emptyInstance(): MapInstanceState {
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {},
      connections: {},
    },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    lastMovedTokenKey: null,
  }
}

function makeState(): EncounterState {
  const session: Session = {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [
      makeParticipant(goblinEntity(), goblinId, { side: "enemies" }),
    ],
  }
  return { session, mapInstance: emptyInstance() }
}

let sequence = 0
const newId = () => `test-id-${++sequence}`

describe("reduceConsoleOptimistic", () => {
  it("sums two back-to-back damage writes on one participant (the UNN-226 regression)", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()

    const afterFirst = reduce(state, {
      kind: "write",
      participantId: goblinId,
      write: { component: "vitals", op: "damage", amount: 3 },
    })
    const afterSecond = reduce(afterFirst, {
      kind: "write",
      participantId: goblinId,
      write: { component: "vitals", op: "damage", amount: 4 },
    })

    const vitals = afterSecond.session.participants[0]!.entity.components.vitals
    expect(vitals).toEqual({ base: 20, damage: 7 })
    // The input frames are untouched (immutability contract).
    expect(state.session.participants[0]!.entity.components.vitals).toEqual({
      base: 20,
      damage: 0,
    })
    expect(
      afterFirst.session.participants[0]!.entity.components.vitals
    ).toEqual({ base: 20, damage: 3 })
  })

  it("returns the frame unchanged on a Writer refusal", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()

    const next = reduce(state, {
      kind: "write",
      participantId: goblinId,
      // The goblin carries no skillPool — capability-missing refusal.
      write: { component: "skillPool", op: "damage", amount: 2 },
    })

    expect(next).toBe(state)
  })

  it("appends a roster slot without an occupancy token on a zone-less addPaired", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()
    const joinerId = asParticipantId("p-joiner")

    const next = reduce(state, {
      kind: "addPaired",
      setup: {
        id: joinerId,
        side: "players",
        entity: { id: "e-joiner", components: { identity: { name: "Ren" } } },
      },
    })

    expect(next.session.participants.map((p) => p.id)).toEqual([
      goblinId,
      joinerId,
    ])
    expect(next.mapInstance.occupancy).toEqual({})
  })

  it("mints the occupancy token for a placed addPaired", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()
    const joinerId = asParticipantId("p-joiner")

    const next = reduce(state, {
      kind: "addPaired",
      setup: {
        id: joinerId,
        side: "players",
        entity: { id: "e-joiner", components: { identity: { name: "Ren" } } },
      },
      zoneId: "zone-1",
    })

    expect(next.mapInstance.occupancy[joinerId]).toEqual({
      zoneId: "zone-1",
      engagement: { status: "free" },
    })
  })

  it("routes a generic event through the encounter reducer", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()

    const next = reduce(state, {
      kind: "event",
      event: { kind: "setAilment", participantId: goblinId, ailment: "burn" },
    })

    expect(next.session.participants[0]!.overlay.ailments).toEqual(["burn"])
  })

  it("routes a spatial event through the map-instance arm", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const state = makeState()

    const next = reduce(state, {
      kind: "event",
      event: { kind: "addZone", name: "Courtyard", zoneId: "zone-1" },
    })

    expect(next.mapInstance.geometry.zones["zone-1"]?.name).toBe("Courtyard")
    expect(next.session).toBe(state.session)
  })

  it("drops the roster slot and severs occupancy on removePaired", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const placed = reduce(makeState(), {
      kind: "event",
      event: { kind: "addZone", name: "Courtyard", zoneId: "zone-1" },
    })
    const withToken = reduce(placed, {
      kind: "event",
      event: { kind: "placeCombatant", tokenKey: goblinId, zoneId: "zone-1" },
    })

    const next = reduce(withToken, {
      kind: "removePaired",
      participantId: goblinId,
    })

    expect(next.session.participants).toEqual([])
    expect(next.mapInstance.occupancy[goblinId]).toBeUndefined()
  })
})
