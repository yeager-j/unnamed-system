import { describe, expect, it } from "vitest"

import { createGameEngine } from "@workspace/game-v2/composition"
import { asParticipantId } from "@workspace/game-v2/encounter/ids"
import { createSessionFactory } from "@workspace/game-v2/encounter/session-factory"
import type { Entity } from "@workspace/game-v2/kernel/entity"

/** A deterministic id generator (`id-1`, `id-2`, …) for stable assertions. */
function counterIds(): () => string {
  let n = 0
  return () => `id-${++n}`
}

/** A stub catalog: only `goblin` resolves, so unknown keys are easy to exercise. */
const goblinTemplate: Entity = {
  id: "goblin",
  components: {
    identity: { name: "Goblin" },
    level: { value: 1 },
    attributes: { base: { strength: 0, magic: -1, agility: 1, luck: 0 } },
    affinities: { base: { wind: "weak", dark: "resist" } },
    vitals: { base: 16, damage: 0 },
  },
}
const stubGetEnemy = (key: string): Entity | undefined =>
  key === "goblin" ? goblinTemplate : undefined

describe("createSessionFactory — clean mint (R1.2)", () => {
  it("opens at round 1 with no actor and no advantage declared", () => {
    const session = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([{ side: "players", source: { entity: { id: "pc-1", components: {} } } }])
    expect(session.round).toBe(1)
    expect(session.currentActorId).toBeNull()
    expect(session.advantage).toBeNull()
    expect(session.firstSide).toBeNull()
    expect(session.participants).toHaveLength(1)
  })

  it("resolves a participant id from setup.id, else newId()", () => {
    const session = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([
      {
        id: asParticipantId("kept"),
        side: "players",
        source: { entity: { id: "e", components: {} } },
      },
      { side: "enemies", source: { catalog: "goblin" } },
    ])
    expect(session.participants.map((p) => p.id)).toEqual(["kept", "id-1"])
  })

  it("defaults a fresh overlay per participant, hasActed → turnsTakenThisRound", () => {
    const { participants } = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([
      { side: "players", source: { entity: { id: "e1", components: {} } } },
      {
        side: "enemies",
        hasActed: true,
        source: { entity: { id: "e2", components: {} } },
      },
    ])
    const present = participants[0]!
    const joiner = participants[1]!
    expect(present.overlay.allegiance.side).toBe("players")
    expect(present.overlay.turnState.turnsTakenThisRound).toBe(0)
    expect(present.overlay.ailments).toEqual([])
    expect(joiner.overlay.turnState.turnsTakenThisRound).toBe(1)
  })
})

describe("createSessionFactory — entity source arms", () => {
  it("passes a ready { entity } through untouched", () => {
    const entity: Entity = {
      id: "object-1",
      components: { identity: { name: "Crate" } },
    }
    const participant = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([{ side: "enemies", source: { entity } }]).participants[0]!
    expect(participant.entity).toBe(entity)
  })

  it("instantiates { catalog } into a plain inline entity (full base + fresh damage 0, no catalogRef)", () => {
    const participant = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([
      {
        id: asParticipantId("g1"),
        side: "enemies",
        source: { catalog: "goblin" },
      },
    ]).participants[0]!

    expect(participant.entity.components.identity).toEqual({ name: "Goblin" })
    expect(participant.entity.components.level).toEqual({ value: 1 })
    expect(participant.entity.components.attributes).toEqual({
      base: { strength: 0, magic: -1, agility: 1, luck: 0 },
    })
    expect(participant.entity.components.vitals).toEqual({
      base: 16,
      damage: 0,
    })
    // The inline entity reuses its roster id; no catalog reference is retained.
    expect(participant.entity.id).toBe("g1")
    expect(participant.entity.components).not.toHaveProperty("catalogRef")
  })

  it("always resets a catalog enemy's vitals.damage to 0 at mint", () => {
    const wounded: Entity = {
      id: "goblin",
      components: { vitals: { base: 16, damage: 9 } },
    }
    const participant = createSessionFactory(
      { getEnemy: () => wounded },
      counterIds()
    )([{ side: "enemies", source: { catalog: "goblin" } }]).participants[0]!
    expect(participant.entity.components.vitals).toEqual({
      base: 16,
      damage: 0,
    })
  })

  it("deep-copies the template so mints never alias the catalog constant or each other", () => {
    const { participants } = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([
      { side: "enemies", source: { catalog: "goblin" } },
      { side: "enemies", source: { catalog: "goblin" } },
    ])
    const [a, b] = [participants[0]!, participants[1]!]
    // Mutating one minted enemy's authored sub-object must not bleed into its
    // sibling or the shared module-level template.
    a.entity.components.attributes!.base.strength = 99
    expect(b.entity.components.attributes!.base.strength).toBe(0)
    expect(goblinTemplate.components.attributes!.base.strength).toBe(0)
  })

  it("seeds vitals.base = 0 for an unknown catalog key (R12.3 → R13.2 Fallen)", () => {
    const participant = createSessionFactory(
      { getEnemy: stubGetEnemy },
      counterIds()
    )([{ side: "enemies", source: { catalog: "dragon" } }]).participants[0]!
    expect(participant.entity.components.vitals).toEqual({ base: 0, damage: 0 })
  })
})

describe("createSessionFactory — bound to the real catalog (composition)", () => {
  it("mints a real catalog enemy via createGameEngine().createSession", () => {
    const engine = createGameEngine()
    const session = engine.createSession(
      [
        {
          id: asParticipantId("g"),
          side: "enemies",
          source: { catalog: "goblin" },
        },
      ],
      counterIds()
    )
    const participant = session.participants[0]!
    // The real `goblin` template resolved (a positive authored base) and minted
    // with fresh depletion. Exact base is asserted against the stub above; here we
    // only prove the composition wiring + the unknown-key contract's inverse.
    expect(participant.entity.components.vitals?.damage).toBe(0)
    expect(participant.entity.components.vitals?.base).toBeGreaterThan(0)
    expect(participant.entity.components.identity?.name).toBe("Goblin")
    expect(participant.overlay.allegiance.side).toBe("enemies")
  })
})
