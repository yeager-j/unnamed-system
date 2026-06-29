import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { createResolve } from "@workspace/game-v2/resolve/resolve"

import { asParticipantId } from "./ids"
import type { EncounterInstanceComponents } from "./instance"
import { defaultOverlay } from "./overlay"
import {
  assembleReadBag,
  participantZoneEffects,
  resolveParticipant,
} from "./read-bag"
import { makeParticipant } from "./session"
import type { SpatialReads } from "./spatial-reads"

const resolve = createResolve({ getArchetype: () => undefined })

/** A combatant standing in zone `z1`, on a board whose `z1` is Toccata-enchanted (ff). */
const toccataAtZ1: SpatialReads = {
  zoneOf: (id) => (id === "p1" ? "z1" : undefined),
  activeEnchantment: () => ({ zoneId: "z1", type: "toccata", forte: 2 }),
}

const TOCCATA_FF = { type: "attackRoll", amount: 2, source: "Toccata" }

/** A combatant standing in `z1`, on a board whose `z1` is Requiem-enchanted (emits no attackRoll/damage effects). */
const requiemAtZ1: SpatialReads = {
  zoneOf: (id) => (id === "p1" ? "z1" : undefined),
  activeEnchantment: () => ({ zoneId: "z1", type: "requiem", forte: 2 }),
}

describe("participantZoneEffects — the SpatialReads → enchantment projection (CD15)", () => {
  it("confers the active enchantment's effects on a combatant in its zone", () => {
    expect(participantZoneEffects(toccataAtZ1, asParticipantId("p1"))).toEqual([
      TOCCATA_FF,
    ])
  })

  it("is empty for a combatant standing in a different zone", () => {
    const elsewhere: SpatialReads = {
      zoneOf: () => "z2",
      activeEnchantment: () => ({ zoneId: "z1", type: "toccata", forte: 2 }),
    }
    expect(participantZoneEffects(elsewhere, asParticipantId("p1"))).toEqual([])
  })

  it("is empty when no enchantment is active (mapless / unenchanted)", () => {
    const none: SpatialReads = {
      zoneOf: () => "z1",
      activeEnchantment: () => null,
    }
    expect(participantZoneEffects(none, asParticipantId("p1"))).toEqual([])
  })

  it("is empty for an unplaced combatant (zoneOf → undefined)", () => {
    expect(
      participantZoneEffects(toccataAtZ1, asParticipantId("ghost"))
    ).toEqual([])
  })
})

describe("resolveParticipant — un-defers Toccata into pendingEffects (display-only, R19.5)", () => {
  const participant = makeParticipant(
    { id: "e1", components: {} },
    asParticipantId("p1"),
    { side: "players" }
  )

  it("pipes the zone effect through ResolveContext.effects into pendingEffects", () => {
    const resolved = resolveParticipant(resolve, toccataAtZ1, participant)
    expect(resolved.components.pendingEffects).toEqual({
      attackRoll: [TOCCATA_FF],
      damage: [],
    })
  })

  it("surfaces nothing for a combatant outside the enchanted zone", () => {
    const elsewhere: SpatialReads = {
      zoneOf: () => "z2",
      activeEnchantment: () => ({ zoneId: "z1", type: "toccata", forte: 2 }),
    }
    expect(
      resolveParticipant(resolve, elsewhere, participant).components
        .pendingEffects
    ).toBeUndefined()
  })

  it("surfaces nothing on a mapless board (no active enchantment)", () => {
    const none: SpatialReads = {
      zoneOf: () => "z1",
      activeEnchantment: () => null,
    }
    expect(
      resolveParticipant(resolve, none, participant).components.pendingEffects
    ).toBeUndefined()
  })

  it("surfaces nothing for an in-zone combatant under an effect-less enchantment (Requiem)", () => {
    expect(
      resolveParticipant(resolve, requiemAtZ1, participant).components
        .pendingEffects
    ).toBeUndefined()
  })

  it("surfaces nothing for an unplaced combatant", () => {
    const unplaced = makeParticipant(
      { id: "e2", components: {} },
      asParticipantId("ghost"),
      { side: "players" }
    )
    expect(
      resolveParticipant(resolve, toccataAtZ1, unplaced).components
        .pendingEffects
    ).toBeUndefined()
  })
})

describe("assembleReadBag — the three-home merge (CD14)", () => {
  const entity: Entity = {
    id: "e1",
    components: { identity: { name: "Iris" }, vitals: { base: 30, damage: 0 } },
  }
  const resolved = resolve(entity)
  const overlay = defaultOverlay({ side: "players" })
  const instance: Partial<EncounterInstanceComponents> = {
    position: { zoneId: "z1" },
    engagement: {
      status: "engaged",
      targetCombatantIds: [asParticipantId("c-2")],
    },
  }

  it("unions resolved read-units ∪ raw overlay ∪ raw instance under the entity id", () => {
    const bag = assembleReadBag(resolved, overlay, instance)
    expect(bag.id).toBe("e1")
    // Resolved durable read-units.
    expect(bag.components.identity).toEqual({ name: "Iris" })
    expect(bag.components.vitals).toEqual({ maxHP: 30, currentHP: 30 })
    // Raw overlay components (all six present).
    expect(bag.components.allegiance).toEqual({ side: "players" })
    expect(bag.components.ailments).toEqual([])
    // Raw instance components — passed through verbatim, NOT resolved.
    expect(bag.components.position).toEqual({ zoneId: "z1" })
    expect(bag.components.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c-2"],
    })
  })

  it("omits instance keys when absent (mapless → engagedWith [] structurally)", () => {
    const bag = assembleReadBag(resolved, overlay)
    expect("position" in bag.components).toBe(false)
    expect("engagement" in bag.components).toBe(false)
    // Overlay + resolved survive regardless.
    expect(bag.components.allegiance).toEqual({ side: "players" })
    expect(bag.components.vitals).toEqual({ maxHP: 30, currentHP: 30 })
  })
})
