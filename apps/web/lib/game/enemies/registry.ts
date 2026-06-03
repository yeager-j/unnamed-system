import { getSkill } from "../skills"
import { intellectDevourer } from "./5e/aberration/intellect-devourer"
import { wolf } from "./5e/beast/wolf"
import { bandit } from "./5e/humanoid/bandit"
import { banditCaptain } from "./5e/humanoid/bandit-captain"
import { bugbear } from "./5e/humanoid/bugbear"
import { goblin } from "./5e/humanoid/goblin"
import { goblinLeader } from "./5e/humanoid/goblin-leader"
import { goblinWarrior } from "./5e/humanoid/goblin-warrior"
import { doppelganger } from "./5e/monstrosity/doppelganger"
import { shadow } from "./5e/undead/shadow"
import { enemyDefinitionSchema, type EnemyDefinition } from "./schema"

/**
 * Structurally validates a catalog enemy, then asserts every referenced
 * `skillKey` resolves to a real Skill so a typo in the catalog fails the import
 * rather than a downstream lookup. Mirrors the items registry's validator.
 */
function validate<T extends EnemyDefinition>(enemy: T): T {
  enemyDefinitionSchema.parse(enemy)

  for (const skillKey of enemy.skillKeys) {
    if (!getSkill(skillKey)) {
      throw new Error(
        `Enemy "${enemy.key}" references unknown skill "${skillKey}"`
      )
    }
  }

  return enemy
}

/** Every catalog enemy by key. The single registry the `catalog` combatant-ref
 *  arm resolves against, mirroring `ITEMS_BY_KEY`. */
const ENEMIES_BY_KEY = {
  goblin: validate(goblin),
  "goblin-warrior": validate(goblinWarrior),
  "goblin-leader": validate(goblinLeader),
  bandit: validate(bandit),
  "bandit-captain": validate(banditCaptain),
  bugbear: validate(bugbear),
  wolf: validate(wolf),
  shadow: validate(shadow),
  "intellect-devourer": validate(intellectDevourer),
  doppelganger: validate(doppelganger),
} as const satisfies Record<string, EnemyDefinition>

export type EnemyKey = keyof typeof ENEMIES_BY_KEY

export const ENEMIES: readonly EnemyDefinition[] = Object.values(ENEMIES_BY_KEY)

/**
 * Runtime lookup index keyed by arbitrary `string`, so {@link getEnemy} can
 * resolve a persisted `enemyKey` against the catalog without widening the
 * literal-keyed {@link ENEMIES_BY_KEY} (whose precise keys derive
 * {@link EnemyKey}).
 */
const ENEMY_INDEX: ReadonlyMap<string, EnemyDefinition> = new Map(
  Object.entries(ENEMIES_BY_KEY)
)

/**
 * Looks up a hardcoded catalog enemy by its slug key. Returns `undefined` when
 * no enemy matches — a `{ kind: "catalog-enemy", enemyKey }` ref resolves through
 * this.
 */
export function getEnemy(key: string): EnemyDefinition | undefined {
  return ENEMY_INDEX.get(key)
}
