import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  engaged,
  free,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import {
  counterIds,
  entity,
  participantWith,
  sessionOf,
} from "./__fixtures__/session"
import {
  addParticipantPaired,
  comintMapInstance,
  createReduceEncounter,
  removeParticipantPaired,
  type EncounterState,
} from "./reduce-encounter"
import type { CombatEvent } from "./session-event"

const stateOf = (
  participants: Parameters<typeof sessionOf>[0],
  scalars?: Parameters<typeof sessionOf>[1],
  mapInstance = makeMapInstanceState()
): EncounterState => ({
  session: sessionOf(participants, scalars),
  mapInstance,
})

const reduceEncounter = createReduceEncounter(() => "minted")

describe("createReduceEncounter (the cross-track join, §2.9)", () => {
  it("routes a combat event to the session reducer, carrying the map-instance untouched", () => {
    const state = stateOf([participantWith({ id: "p1" })], { round: 1 })
    const next = reduceEncounter(state, { kind: "setRound", round: 5 })
    expect(next.session.round).toBe(5)
    expect(next.mapInstance).toBe(state.mapInstance)
  })

  it("routes a spatial event to reduceMapInstance, carrying the session untouched", () => {
    const state = stateOf(
      [participantWith({ id: "p1" })],
      undefined,
      makeMapInstanceState({ geometry: makeGeometry([makeZone("z1")]) })
    )
    const next = reduceEncounter(state, {
      kind: "applyEnchantment",
      zoneId: "z1",
      enchantment: "toccata",
    })
    expect(next.mapInstance.enchantment).toEqual({
      zoneId: "z1",
      type: "toccata",
      forte: 1,
    })
    expect(next.session).toBe(state.session)
  })

  it("preserves same-ref on a combat no-op (the whole EncounterState reference)", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    const next = reduceEncounter(state, {
      kind: "draftCombatant",
      participantId: asParticipantId("ghost"),
    })
    expect(next).toBe(state)
  })

  it("preserves same-ref on a spatial no-op (the whole EncounterState reference)", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    // clearEnchantment over a board with no enchantment is an Immer no-op.
    const next = reduceEncounter(state, { kind: "clearEnchantment" })
    expect(next).toBe(state)
  })

  it("leaves mapInstanceId untouched (the session reducer is spatial-blind, R24.5)", () => {
    const state = stateOf([participantWith({ id: "p1" })], {
      mapInstanceId: "map-7",
    })
    const next = reduceEncounter(state, { kind: "advanceRound" })
    expect(next.session.mapInstanceId).toBe("map-7")
  })
})

describe("comintMapInstance (the birth co-mint, R1.3)", () => {
  it("keys each placed participant's token by its own id (participantId === token key)", () => {
    const session = sessionOf([
      participantWith({ id: "p1" }),
      participantWith({ id: "p2", side: "enemies" }),
    ])
    const mapInstance = comintMapInstance(session, {
      [asParticipantId("p1")]: "z1",
      [asParticipantId("p2")]: "z2",
    })
    expect(Object.keys(mapInstance.occupancy).sort()).toEqual(["p1", "p2"])
    expect(mapInstance.occupancy.p1).toEqual(free("z1"))
    expect(mapInstance.occupancy.p2).toEqual(free("z2"))
  })

  it("leaves an unplaced participant tokenless (zoneOf stays undefined)", () => {
    const session = sessionOf([
      participantWith({ id: "p1" }),
      participantWith({ id: "p2", side: "enemies" }),
    ])
    const mapInstance = comintMapInstance(session, {
      [asParticipantId("p1")]: "z1",
    })
    expect(Object.keys(mapInstance.occupancy)).toEqual(["p1"])
  })
})

describe("addParticipantPaired (addParticipant ↔ addOccupant)", () => {
  it("appends the roster slot and places its token under the same id", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    const event: Extract<CombatEvent, { kind: "addParticipant" }> = {
      kind: "addParticipant",
      setup: {
        id: asParticipantId("g1"),
        side: "enemies",
        entity: entity({}, "goblin"),
      },
    }
    const next = addParticipantPaired(() => "unused")(state, event, "z3")
    expect(next.session.participants.map((p) => p.id)).toContain("g1")
    expect(next.mapInstance.occupancy.g1).toEqual(free("z3"))
  })

  it("mints one shared id when the setup omits it (both rows agree)", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    const event: Extract<CombatEvent, { kind: "addParticipant" }> = {
      kind: "addParticipant",
      setup: { side: "enemies", entity: entity({}, "goblin") },
    }
    const next = addParticipantPaired(counterIds())(state, event, "z3")
    const added = next.session.participants.find((p) => p.id !== "p1")!
    expect(added.id).toBe("minted-1")
    expect(next.mapInstance.occupancy["minted-1"]).toEqual(free("z3"))
  })

  it("appends the roster slot with no token when the zone is omitted (add-then-place)", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    const event: Extract<CombatEvent, { kind: "addParticipant" }> = {
      kind: "addParticipant",
      setup: {
        id: asParticipantId("g1"),
        side: "enemies",
        entity: entity({}, "goblin"),
      },
    }
    const next = addParticipantPaired(() => "unused")(state, event)
    expect(next.session.participants.map((p) => p.id)).toContain("g1")
    expect(next.mapInstance).toBe(state.mapInstance)
    expect(next.mapInstance.occupancy.g1).toBeUndefined()
  })
})

describe("removeParticipantPaired (removeParticipant ↔ removeOccupant-sever)", () => {
  it("drops the roster slot, the token, and severs every survivor's engagement to it", () => {
    const state = stateOf(
      [
        participantWith({ id: "p1" }),
        participantWith({ id: "p2", side: "enemies" }),
      ],
      {},
      makeMapInstanceState({
        occupancy: {
          p1: engaged("z1", ["p2"]),
          p2: engaged("z1", ["p1"]),
        },
      })
    )
    const next = removeParticipantPaired(() => "unused")(state, {
      kind: "removeParticipant",
      participantId: asParticipantId("p2"),
    })
    expect(next.session.participants.map((p) => p.id)).toEqual(["p1"])
    expect(next.mapInstance.occupancy.p2).toBeUndefined()
    expect(next.mapInstance.occupancy.p1!.engagement).toEqual({
      status: "free",
    })
  })
})
