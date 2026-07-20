import { describe, expect, it } from "vitest"

import {
  defaultOverlay,
  makeParticipant,
  type EncounterState,
  type SessionShell,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ReplicaSnapshot } from "@workspace/replica"

import {
  composeCombatModel,
  encounterRootDiffersFromLoaderFrame,
} from "./compose-combat-model"
import type { ParticipantMeta } from "./participant-meta"
import type {
  CombatDurableState,
  EncounterReplicaState,
} from "./replica/mutations"
import type { CombatReplicaRejection } from "./replica/rejection"

const durableOne = asParticipantId("durable-1")
const durableTwo = asParticipantId("durable-2")
const inline = asParticipantId("inline-1")
const unknown = asParticipantId("unknown-1")
const optimisticAddition = asParticipantId("new-inline")

function entity(id: string, damage: number): Entity {
  return {
    id,
    components: {
      identity: { name: id },
      presentation: { portraitUrl: `${id}.png` },
      vitals: { base: 20, damage },
      skillPool: { base: 8, spSpent: 1 },
      resources: { hitDiceUsed: 1, skillDiceUsed: 0, prismaUsed: 1 },
    },
  }
}

function eventFrame(): EncounterState {
  return {
    session: {
      round: 3,
      currentActorId: durableOne,
      advantage: null,
      firstSide: "players",
      participants: [
        makeParticipant(entity("entity-1", 1), durableOne, {
          side: "players",
        }),
        makeParticipant(entity("entity-1", 4), durableTwo, {
          side: "players",
        }),
        makeParticipant(entity("enemy-1", 2), inline, { side: "enemies" }),
        makeParticipant(entity("unknown", 5), unknown, { side: "enemies" }),
      ],
    },
    mapInstance: {
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
    },
  }
}

const meta: Record<string, ParticipantMeta> = {
  [durableOne]: {
    storage: "durable",
    characterId: "entity-1",
    characterShortId: "one",
  },
  [durableTwo]: {
    storage: "durable",
    characterId: "entity-1",
    characterShortId: "one",
  },
  [inline]: { storage: "inline" },
}

/** A ready encounter-root snapshot over inline shell participants. */
function encounterSnapshot(
  participants: Record<string, Record<string, unknown>>
) {
  const shellParticipants: SessionShell["participants"] = Object.entries(
    participants
  ).map(([id, components]) => ({
    id: asParticipantId(id),
    entity: {
      storage: "inline" as const,
      entity: { id: `${id}-entity`, components },
    },
    overlay: defaultOverlay({ side: "enemies" }),
  }))
  return snapshot<EncounterReplicaState>({
    status: "live",
    session: {
      round: 3,
      currentActorId: null,
      advantage: null,
      firstSide: null,
      participants: shellParticipants,
    },
  })
}

function snapshot<State>(
  value: State
): ReplicaSnapshot<State, CombatReplicaRejection> {
  return {
    value,
    pending: 0,
    connection: "connected",
    conflicts: [],
    expired: false,
  }
}

describe("composeCombatModel", () => {
  it("returns the event frame unchanged before any replica is ready", () => {
    const frame = eventFrame()
    expect(
      composeCombatModel({
        eventFrame: frame,
        encounterReplicaSnapshot: null,
        durableReplicaSnapshots: new Map(),
        participantMeta: meta,
      })
    ).toBe(frame)
  })

  it("joins durable roots with Encounter-owned session facts", () => {
    const frame = eventFrame()
    const durable = snapshot<CombatDurableState>({
      components: { vitals: { base: 20, damage: 7 } },
    })
    const encounter = encounterSnapshot({
      [inline]: { vitals: { base: 20, damage: 9 } },
    })

    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: encounter,
      durableReplicaSnapshots: new Map([["entity-1", durable]]),
      participantMeta: meta,
    })

    expect(model.mapInstance).toBe(frame.mapInstance)
    expect(model.session.round).toBe(3)
    expect(model.session.currentActorId).toBeNull()
    expect(model.session.participants[0]!.overlay).toBe(
      frame.session.participants[0]!.overlay
    )
    expect(
      model.session.participants[0]!.entity.components.vitals?.damage
    ).toBe(7)
    expect(
      model.session.participants[1]!.entity.components.vitals?.damage
    ).toBe(7)
    expect(
      model.session.participants[2]!.entity.components.vitals?.damage
    ).toBe(9)
    expect(
      model.session.participants[3]!.entity.components.vitals?.damage
    ).toBe(5)
  })

  it("replaces the complete combat subset instead of preserving stale capabilities", () => {
    const frame = eventFrame()
    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: null,
      durableReplicaSnapshots: new Map([
        [
          "entity-1",
          snapshot<CombatDurableState>({
            components: { vitals: { base: 20, damage: 6 } },
          }),
        ],
      ]),
      participantMeta: meta,
    })
    const components = model.session.participants[0]!.entity.components

    expect(components.vitals?.damage).toBe(6)
    expect(components.skillPool).toBeUndefined()
    expect(components.resources).toBeUndefined()
    expect(components.identity).toEqual({ name: "entity-1" })
    expect(components.presentation).toEqual({
      portraitUrl: "entity-1.png",
    })
  })

  it("projects one durable entity into every roster slot it occupies (duplicate-durable)", () => {
    const frame = eventFrame()
    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: null,
      durableReplicaSnapshots: new Map([
        [
          "entity-1",
          snapshot<CombatDurableState>({
            components: { vitals: { base: 20, damage: 11 } },
          }),
        ],
      ]),
      participantMeta: meta,
    })

    // durableOne and durableTwo are two roster slots over ONE entity row;
    // the single entity replica's projection reaches both uniformly.
    expect(
      model.session.participants[0]!.entity.components.vitals?.damage
    ).toBe(11)
    expect(
      model.session.participants[1]!.entity.components.vitals?.damage
    ).toBe(11)
  })

  it("replaces the complete combat subset for inline participants too — no stale capability survives", () => {
    const frame = eventFrame()
    // The accepted inline entity carries vitals only: the frame's skillPool
    // and resources must not survive the fold (an absent capability in
    // accepted state is a fact, not a gap).
    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: encounterSnapshot({
        [inline]: { vitals: { base: 20, damage: 8 } },
      }),
      durableReplicaSnapshots: new Map(),
      participantMeta: meta,
    })
    const components = model.session.participants[2]!.entity.components

    expect(components.vitals?.damage).toBe(8)
    expect(components.skillPool).toBeUndefined()
    expect(components.resources).toBeUndefined()
    expect(components.identity).toBeUndefined()
  })

  it("renders the full inline stored entity and overlay from the Encounter root", () => {
    const frame = eventFrame()
    frame.session.participants[2]!.overlay.allegiance.side = "players"
    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: encounterSnapshot({
        [inline]: {
          vitals: { base: 20, damage: 8 },
          presentation: { portraitUrl: "projected.png" },
        },
      }),
      durableReplicaSnapshots: new Map(),
      participantMeta: meta,
    })
    const components = model.session.participants[2]!.entity.components

    expect(components.presentation).toEqual({ portraitUrl: "projected.png" })
    expect(model.session.participants[2]?.overlay.allegiance.side).toBe(
      "enemies"
    )
  })

  it("keeps the event-frame participant when a ready inline root has no entry", () => {
    const frame = eventFrame()
    const model = composeCombatModel({
      eventFrame: frame,
      encounterReplicaSnapshot: encounterSnapshot({}),
      durableReplicaSnapshots: new Map(),
      participantMeta: meta,
    })

    expect(model.session.participants[2]).toBe(frame.session.participants[2])
  })

  it("takes roster additions and removals only from the event frame", () => {
    const frame = eventFrame()
    const added = makeParticipant(entity("new-inline", 3), optimisticAddition, {
      side: "enemies",
    })
    const eventFrameWithRosterChange: EncounterState = {
      ...frame,
      session: {
        ...frame.session,
        participants: [frame.session.participants[0]!, added],
      },
    }

    const model = composeCombatModel({
      eventFrame: eventFrameWithRosterChange,
      encounterReplicaSnapshot: encounterSnapshot({
        [inline]: { vitals: { base: 20, damage: 9 } },
      }),
      durableReplicaSnapshots: new Map([
        [
          "entity-1",
          snapshot<CombatDurableState>({
            components: { vitals: { base: 20, damage: 7 } },
          }),
        ],
      ]),
      participantMeta: meta,
    })

    expect(
      model.session.participants.map((participant) => participant.id)
    ).toEqual([durableOne, optimisticAddition])
    expect(
      model.session.participants[0]!.entity.components.vitals?.damage
    ).toBe(7)
    expect(model.session.participants[1]).toBe(added)
  })
})

describe("encounterRootDiffersFromLoaderFrame", () => {
  it("ignores migrated session facts and detects only command-owned divergence", () => {
    const frame = eventFrame()
    const shell = encounterSnapshot({}).value
    const completeMeta: Record<string, ParticipantMeta> = {
      ...meta,
      [unknown]: { storage: "inline" },
    }
    const sameRosterRoot: EncounterReplicaState = {
      status: "live",
      session: {
        ...shell.session,
        round: 99,
        currentActorId: null,
        participants: frame.session.participants.map((participant) => {
          const participantMeta = completeMeta[participant.id]
          return {
            id: participant.id,
            overlay: defaultOverlay({ side: "enemies" }),
            entity:
              participantMeta?.storage === "durable"
                ? {
                    storage: "durable" as const,
                    entityId: participantMeta.characterId,
                  }
                : {
                    storage: "inline" as const,
                    entity: participant.entity,
                  },
          }
        }),
      },
    }
    const loader = {
      status: "live" as const,
      session: frame.session,
      participantMeta: completeMeta,
    }

    expect(encounterRootDiffersFromLoaderFrame(sameRosterRoot, loader)).toBe(
      false
    )
    expect(
      encounterRootDiffersFromLoaderFrame(
        { ...sameRosterRoot, status: "ended" },
        loader
      )
    ).toBe(true)
    expect(
      encounterRootDiffersFromLoaderFrame(
        {
          ...sameRosterRoot,
          session: {
            ...sameRosterRoot.session,
            participants: sameRosterRoot.session.participants.slice(1),
          },
        },
        loader
      )
    ).toBe(true)
  })
})
