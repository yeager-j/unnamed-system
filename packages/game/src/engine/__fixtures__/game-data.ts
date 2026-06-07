import { type GameData } from "@workspace/game/engine/ports"
import { type Archetype } from "@workspace/game/foundation/archetypes/schema"
import { type Talent } from "@workspace/game/foundation/character/talents/schema"
import {
  type EnemyDefinition,
  type EnemyFamily,
} from "@workspace/game/foundation/enemies/schema"
import {
  isEquippable,
  type EquippableItem,
  type Item,
} from "@workspace/game/foundation/items/schema"
import { type Skill } from "@workspace/game/foundation/skills/schema"

/**
 * Collections a {@link makeTestGameData} caller can seed. Every field defaults to
 * empty, so a test states only the catalog slice its subject reads.
 */
export interface TestGameDataOverrides {
  archetypes?: readonly Archetype[]
  skills?: readonly Skill[]
  talents?: readonly Talent[]
  items?: readonly Item[]
  enemies?: readonly EnemyDefinition[]
  /** Maps an enemy key to its {@link EnemyFamily} (the real registry derives this
   *  from directory structure, not a field on the definition). */
  enemyFamilies?: Readonly<Record<string, EnemyFamily>>
}

function indexBy<T>(
  entries: readonly T[],
  key: (entry: T) => string
): Map<string, T> {
  return new Map(entries.map((entry) => [key(entry), entry]))
}

/**
 * A fixture-backed {@link GameData} adapter for engine unit tests — the
 * test-time counterpart to the production `gameData`. Backed by `Map`s over the
 * provided fixtures so logic tests assert *behavior* against synthetic catalogs
 * instead of importing real entries and asserting balance numbers (a rebalance
 * then never breaks a logic test). Anything not seeded simply misses
 * (`get*` → `undefined`, `all*` → `[]`).
 *
 * `getEquippableItem` narrows the seeded `items` exactly as the real registry
 * does (an item is equippable iff it carries an `equip` spec), so callers seed
 * one `items` list rather than restating equippables.
 */
export function makeTestGameData(
  overrides: TestGameDataOverrides = {}
): GameData {
  const archetypes = overrides.archetypes ?? []
  const enemies = overrides.enemies ?? []
  const enemyFamilies = overrides.enemyFamilies ?? {}

  const archetypeByKey = indexBy(archetypes, (a) => a.key)
  const skillByKey = indexBy(overrides.skills ?? [], (s) => s.key)
  const talentByKey = indexBy(overrides.talents ?? [], (t) => t.key)
  const itemByKey = indexBy(overrides.items ?? [], (i) => i.key)
  const enemyByKey = indexBy(enemies, (e) => e.key)

  const getItem = (key: string): Item | undefined => itemByKey.get(key)

  return {
    getArchetype: (key) => archetypeByKey.get(key),
    allArchetypes: () => archetypes,
    getSkill: (key) => skillByKey.get(key),
    getTalent: (key) => talentByKey.get(key),
    getItem,
    getEquippableItem: (key): EquippableItem | undefined => {
      const item = getItem(key)
      return item && isEquippable(item) ? item : undefined
    },
    getEnemy: (key) => enemyByKey.get(key),
    getEnemyFamily: (key) => enemyFamilies[key],
    allEnemies: () => enemies,
  }
}
