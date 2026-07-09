import { describe, expect, it } from "vitest"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { createResolve } from "@workspace/game-v2/resolve/resolve"

import { sessionOf } from "./__fixtures__/session"
import type { EncounterInstanceComponents } from "./instance"
import { defaultOverlay } from "./overlay"
import {
  assembleParticipantView,
  participantResolveContext,
  participantZoneEffects,
  resolveParticipant,
  resolveSession,
} from "./participant-view"
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

describe("participantResolveContext — the sheet-surfaces' shared context (UNN-566)", () => {
  const playerAtZ1 = makeParticipant(
    { id: "e1", components: {} },
    asParticipantId("p1"),
    { side: "players" }
  )
  const COMPOSITION = { players: { mage: 2 }, enemies: { warlock: 1 } }

  it("carries the zone effects AND the participant's own side's party composition", () => {
    expect(
      participantResolveContext(toccataAtZ1, COMPOSITION, playerAtZ1)
    ).toEqual({
      effects: [TOCCATA_FF],
      partyComposition: { mage: 2 },
    })
  })

  it("reads the side off the allegiance overlay — a charmed PC scales with the side it fights for", () => {
    const charmed = makeParticipant(
      { id: "e1", components: {} },
      asParticipantId("p1"),
      { side: "enemies" }
    )
    expect(
      participantResolveContext(toccataAtZ1, COMPOSITION, charmed)
        .partyComposition
    ).toEqual({ warlock: 1 })
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

describe("assembleParticipantView — the three-home merge (CD14)", () => {
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
    const participantView = assembleParticipantView(resolved, overlay, instance)
    expect(participantView.id).toBe("e1")
    // Resolved durable read-units.
    expect(participantView.components.identity).toEqual({ name: "Iris" })
    expect(participantView.components.vitals).toEqual({
      maxHP: 30,
      currentHP: 30,
    })
    // Raw overlay components (all six present).
    expect(participantView.components.allegiance).toEqual({ side: "players" })
    expect(participantView.components.ailments).toEqual([])
    // Raw instance components — passed through verbatim, NOT resolved.
    expect(participantView.components.position).toEqual({ zoneId: "z1" })
    expect(participantView.components.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c-2"],
    })
  })

  it("omits instance keys when absent (mapless → engagedWith [] structurally)", () => {
    const participantView = assembleParticipantView(resolved, overlay)
    expect("position" in participantView.components).toBe(false)
    expect("engagement" in participantView.components).toBe(false)
    // Overlay + resolved survive regardless.
    expect(participantView.components.allegiance).toEqual({ side: "players" })
    expect(participantView.components.vitals).toEqual({
      maxHP: 30,
      currentHP: 30,
    })
  })
})

describe("resolveSession — resolve once per participant, assemble the view (CD14; UNN-525)", () => {
  const mapless: SpatialReads = {
    zoneOf: () => undefined,
    activeEnchantment: () => null,
  }

  it("resolves each participant exactly once — N calls, not the prior ~5N", () => {
    const session = sessionOf([
      makeParticipant({ id: "e1", components: {} }, asParticipantId("p1"), {
        side: "players",
      }),
      makeParticipant({ id: "e2", components: {} }, asParticipantId("p2"), {
        side: "enemies",
      }),
      makeParticipant({ id: "e3", components: {} }, asParticipantId("p3"), {
        side: "enemies",
      }),
    ])
    let calls = 0
    const counting = (entity: Entity): ResolvedEntity => {
      calls++
      return resolve(entity)
    }

    resolveSession(session, mapless, counting)

    expect(calls).toBe(session.participants.length)
  })

  it("keys the view by participant (roster) id — distinct from the entity id — in session order", () => {
    const session = sessionOf([
      makeParticipant(
        { id: "ent-a", components: { identity: { name: "A" } } },
        asParticipantId("p1"),
        { side: "players" }
      ),
      makeParticipant(
        { id: "ent-b", components: { identity: { name: "B" } } },
        asParticipantId("p2"),
        { side: "enemies" }
      ),
    ])

    const view = resolveSession(session, mapless, resolve)

    expect([...view.keys()]).toEqual([
      asParticipantId("p1"),
      asParticipantId("p2"),
    ])
    // `participantView.id` is the ENTITY id (assembleParticipantView), not the roster key.
    expect(view.get(asParticipantId("p1"))!.id).toBe("ent-a")
    expect(view.get(asParticipantId("p1"))!.components.identity).toEqual({
      name: "A",
    })
  })

  it("assembles mapless views — overlay present, no instance keys", () => {
    const session = sessionOf([
      makeParticipant({ id: "e1", components: {} }, asParticipantId("p1"), {
        side: "players",
      }),
    ])

    const participantView = resolveSession(session, mapless, resolve).get(
      asParticipantId("p1")
    )!

    expect(participantView.components.allegiance).toEqual({ side: "players" })
    expect("position" in participantView.components).toBe(false)
    expect("engagement" in participantView.components).toBe(false)
  })
})
