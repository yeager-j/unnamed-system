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
    generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
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

  it("drops the roster slot and severs occupancy on removePaired", () => {
    const reduce = createReduceConsoleOptimistic(newId)
    const withToken = makeState()
    withToken.mapInstance.geometry.zones["zone-1"] = {
      id: "zone-1",
      pageId: "default",
      name: "Courtyard",
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
    }
    withToken.mapInstance.occupancy[goblinId] = {
      zoneId: "zone-1",
      engagement: { status: "free" },
    }

    const next = reduce(withToken, {
      kind: "removePaired",
      participantId: goblinId,
    })

    expect(next.session.participants).toEqual([])
    expect(next.mapInstance.occupancy[goblinId]).toBeUndefined()
  })
})
