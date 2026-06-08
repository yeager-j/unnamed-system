import { type EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

/**
 * A minimal valid {@link EnemyDefinition} for tests that build a synthetic enemy
 * catalog instead of importing shipped creatures and asserting their balance.
 * Defaults to a bare Level-1 stat block — zeroed Attributes, no affinities,
 * skills, or talents — so a test states only the fields its subject reads
 * (`skillKeys` for skill hydration, `affinities` for weaknesses, etc.). Real
 * catalog slugs passed as `key`/`skillKeys` are opaque ids: assert behavior, not
 * the shipped creature's numbers.
 */
export function makeEnemy(
  overrides: Partial<EnemyDefinition> = {}
): EnemyDefinition {
  return {
    key: "fixture-enemy",
    level: 1,
    name: "Fixture Enemy",
    maxHP: 10,
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    skillKeys: [],
    talents: [],
    ...overrides,
  }
}
