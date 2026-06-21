import { createCatalog } from "@workspace/game/data/catalog/create-catalog"
import { ABERRATION_ENEMIES } from "@workspace/game/data/enemies/5e/aberration/index"
import { BEAST_ENEMIES } from "@workspace/game/data/enemies/5e/beast/index"
import { ELEMENTAL_ENEMIES } from "@workspace/game/data/enemies/5e/elemental/index"
import { HUMANOID_ENEMIES } from "@workspace/game/data/enemies/5e/humanoid/index"
import { MONSTROSITY_ENEMIES } from "@workspace/game/data/enemies/5e/monstrosity/index"
import { UNDEAD_ENEMIES } from "@workspace/game/data/enemies/5e/undead/index"
import { getSkill } from "@workspace/game/data/skills/registry"
import {
  ENEMY_FAMILIES,
  enemyDefinitionSchema,
  type EnemyDefinition,
  type EnemyFamily,
} from "@workspace/game/foundation/enemies/schema"

/**
 * Structurally validates a catalog enemy, then asserts every referenced
 * `skillKey` resolves to a real Skill so a typo in the catalog fails the import
 * rather than a downstream lookup, and that no two of the enemy's Skills (across
 * `skillKeys` and `inlineSkills`) share a `key` — a collision would yield a
 * duplicate React `key` in the rendered Skill list. Runs once per entry at
 * module load via {@link createCatalog}. Mirrors the items registry's validator.
 * Exported so the duplicate-key guard can be exercised directly with a
 * deliberately-colliding enemy (the shipped catalog never collides, so a
 * data-invariant test alone wouldn't prove the guard throws).
 */
export function validateEnemy(enemy: EnemyDefinition): void {
  enemyDefinitionSchema.parse(enemy)

  for (const skillKey of enemy.skillKeys) {
    if (!getSkill(skillKey)) {
      throw new Error(
        `Enemy "${enemy.key}" references unknown skill "${skillKey}"`
      )
    }
  }

  const allSkillKeys = [
    ...enemy.skillKeys,
    ...(enemy.inlineSkills ?? []).map((skill) => skill.key),
  ]
  const duplicate = allSkillKeys.find(
    (key, index) => allSkillKeys.indexOf(key) !== index
  )
  if (duplicate) {
    throw new Error(
      `Enemy "${enemy.key}" has duplicate skill key "${duplicate}"`
    )
  }
}

/** Every catalog enemy by key. The single registry the `catalog` combatant-ref
 *  arm resolves against, mirroring `ITEMS_BY_KEY`. Each creature type's slice
 *  lives in its `5e/<type>/index.ts`; this spreads them so the literal-key
 *  union is preserved. */
const ENEMIES_BY_KEY = {
  ...HUMANOID_ENEMIES,
  ...BEAST_ENEMIES,
  ...UNDEAD_ENEMIES,
  ...ABERRATION_ENEMIES,
  ...MONSTROSITY_ENEMIES,
  ...ELEMENTAL_ENEMIES,
} as const satisfies Record<string, EnemyDefinition>

export type EnemyKey = keyof typeof ENEMIES_BY_KEY

/** Each {@link EnemyFamily}'s slice, the one place the family→slice association
 *  lives. The `satisfies` row asserts (at compile time) that every family has a
 *  slice, so adding a family to {@link ENEMY_FAMILIES} forces wiring it here. */
const SLICE_BY_FAMILY = {
  humanoid: HUMANOID_ENEMIES,
  beast: BEAST_ENEMIES,
  undead: UNDEAD_ENEMIES,
  aberration: ABERRATION_ENEMIES,
  monstrosity: MONSTROSITY_ENEMIES,
  elemental: ELEMENTAL_ENEMIES,
} satisfies Record<EnemyFamily, Record<string, EnemyDefinition>>

/** Every enemy key mapped to its family, derived from the slices so an entry's
 *  family is its directory and is never restated on the definition. */
const ENEMY_FAMILY_BY_KEY: Record<string, EnemyFamily> = Object.fromEntries(
  ENEMY_FAMILIES.flatMap((family) =>
    Object.keys(SLICE_BY_FAMILY[family]).map((key) => [key, family])
  )
)

const catalog = createCatalog<EnemyDefinition>(ENEMIES_BY_KEY, validateEnemy)

export const ENEMIES: readonly EnemyDefinition[] = catalog.all

/**
 * Looks up a hardcoded catalog enemy by its slug key. Returns `undefined` when
 * no enemy matches — a `{ kind: "catalog-enemy", enemyKey }` ref resolves through
 * this.
 */
export function getEnemy(key: string): EnemyDefinition | undefined {
  return catalog.get(key)
}

/**
 * Resolves a catalog enemy's {@link EnemyFamily} from its `key`, or `undefined`
 * when no enemy matches. The family is the creature's directory under
 * `5e/<family>/`, surfaced here so the browse table can column + filter by it
 * without every entry restating its type.
 */
export function getEnemyFamily(key: string): EnemyFamily | undefined {
  return ENEMY_FAMILY_BY_KEY[key]
}
