import { describe, expect, it } from "vitest"

import {
  enemyStatblocks,
  makeEncounter,
} from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { combatEnemyTokensByZone } from "@workspace/game/engine/dungeon/player-snapshot"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

function pc(characterId: string, zoneId = ""): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

function catalogEnemy(enemyKey: string, zoneId = ""): CombatantSetup {
  return { side: "enemies", ref: { kind: "catalog-enemy", enemyKey }, zoneId }
}

/** A fixture goblin carrying attributes + affinities, so the redaction assertion
 *  proves the projection *drops* them, not that it never had them. */
const GOBLIN = makeEnemy({
  key: "goblin",
  name: "Goblin",
  maxHP: 16,
  attributes: { strength: 1, magic: -1, agility: 2, luck: 0 },
  affinities: { fire: "weak" },
})
const CATALOG = makeTestGameData({ enemies: [GOBLIN] })

function tokensByZone(roster: CombatantSetup[]) {
  const { session, instance } = makeEncounter(roster)
  return {
    session,
    instance,
    result: combatEnemyTokensByZone(
      session,
      instance,
      enemyStatblocks(session.combatants, CATALOG)
    ),
  }
}

describe("combatEnemyTokensByZone", () => {
  it("excludes PC combatants — they render as party tokens, not enemies", () => {
    const { result } = tokensByZone([pc("char-aria", "z1")])
    expect(result).toEqual({})
  })

  it("emits exactly { id, name, hp, engagement } per enemy — never attributes or affinities", () => {
    const { result } = tokensByZone([catalogEnemy("goblin", "z1")])

    const [token] = result["z1"]!
    expect(token).toEqual({
      id: "c-0",
      name: "Goblin",
      hp: { current: GOBLIN.maxHP, max: GOBLIN.maxHP },
      engagement: { status: "free" },
    })
    // Structural absence: the redacted enemy data must not appear anywhere on
    // the wire shape — proven against a source that carries both.
    expect(JSON.stringify(result)).not.toContain("affinit")
    expect(JSON.stringify(result)).not.toContain("strength")
    expect(GOBLIN.affinities).toBeDefined()
  })

  it("groups enemies by their Instance Zone", () => {
    const { result } = tokensByZone([
      catalogEnemy("goblin", "z1"),
      catalogEnemy("goblin", "z2"),
    ])

    expect(result["z1"]!.map((t) => t.id)).toEqual(["c-0"])
    expect(result["z2"]!.map((t) => t.id)).toEqual(["c-1"])
  })

  it("buckets an enemy absent from occupancy under the empty-zone key", () => {
    const { session, instance } = makeEncounter([catalogEnemy("goblin", "z1")])
    const noOccupancy = { ...instance, occupancy: {} }

    const result = combatEnemyTokensByZone(
      session,
      noOccupancy,
      enemyStatblocks(session.combatants, CATALOG)
    )
    expect(result[""]!.map((t) => t.id)).toEqual(["c-0"])
  })
})
