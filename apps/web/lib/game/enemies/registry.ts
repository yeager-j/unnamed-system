import { createCatalog } from "../catalog"
import { getSkill } from "../skills"
import { ABERRATION_ENEMIES } from "./5e/aberration"
import { BEAST_ENEMIES } from "./5e/beast"
import { HUMANOID_ENEMIES } from "./5e/humanoid"
import { MONSTROSITY_ENEMIES } from "./5e/monstrosity"
import { UNDEAD_ENEMIES } from "./5e/undead"
import { enemyDefinitionSchema, type EnemyDefinition } from "./schema"

/**
 * Structurally validates a catalog enemy, then asserts every referenced
 * `skillKey` resolves to a real Skill so a typo in the catalog fails the import
 * rather than a downstream lookup. Runs once per entry at module load via
 * {@link createCatalog}. Mirrors the items registry's validator.
 */
function validateEnemy(enemy: EnemyDefinition): void {
  enemyDefinitionSchema.parse(enemy)

  for (const skillKey of enemy.skillKeys) {
    if (!getSkill(skillKey)) {
      throw new Error(
        `Enemy "${enemy.key}" references unknown skill "${skillKey}"`
      )
    }
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
} as const satisfies Record<string, EnemyDefinition>

export type EnemyKey = keyof typeof ENEMIES_BY_KEY

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
