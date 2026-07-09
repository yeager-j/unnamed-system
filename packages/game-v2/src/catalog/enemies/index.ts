import { ABERRATION_ENEMIES } from "@workspace/game-v2/catalog/enemies/aberration"
import { BEAST_ENEMIES } from "@workspace/game-v2/catalog/enemies/beast"
import { ELEMENTAL_ENEMIES } from "@workspace/game-v2/catalog/enemies/elemental"
import { HUMANOID_ENEMIES } from "@workspace/game-v2/catalog/enemies/humanoid"
import { MONSTROSITY_ENEMIES } from "@workspace/game-v2/catalog/enemies/monstrosity"
import { UNDEAD_ENEMIES } from "@workspace/game-v2/catalog/enemies/undead"
import type { Entity } from "@workspace/game-v2/kernel/entity"

/**
 * Catalog enemy templates (UNN-514). These are authored flat-base entities used
 * once at session mint; runtime combatants are inline copies and never
 * catalog-backed refs.
 */
const ENEMIES_BY_KEY = {
  ...HUMANOID_ENEMIES,
  ...BEAST_ENEMIES,
  ...UNDEAD_ENEMIES,
  ...ABERRATION_ENEMIES,
  ...MONSTROSITY_ENEMIES,
  ...ELEMENTAL_ENEMIES,
} as const satisfies Record<string, Entity>

const ENEMY_BY_KEY = new Map<string, Entity>(Object.entries(ENEMIES_BY_KEY))

/** Every catalog enemy template, in registration order. */
export const ENEMIES: readonly Entity[] = [...ENEMY_BY_KEY.values()]

/** Looks up an authored enemy template by key; `undefined` when none matches. */
export function getEnemy(key: string): Entity | undefined {
  return ENEMY_BY_KEY.get(key)
}

/**
 * The creature families the catalog is organized into (the 5e creature types
 * used for playtesting) — the directory grouping under `enemies/<family>.ts`
 * lifted to a first-class display/filter vocabulary. An entry carries no
 * `family` field: it is a property of *where* the template lives, so adding a
 * creature never restates its directory. `getEnemyFamily` resolves a `key` to
 * its family; the browse table groups + filters by it.
 */
export const ENEMY_FAMILIES = [
  "humanoid",
  "beast",
  "undead",
  "aberration",
  "monstrosity",
  "elemental",
] as const
export type EnemyFamily = (typeof ENEMY_FAMILIES)[number]

/** Each {@link EnemyFamily}'s slice — the one place the family→slice association
 *  lives. The `satisfies` row asserts every family has a slice, so adding a
 *  family forces wiring it here. */
const SLICE_BY_FAMILY = {
  humanoid: HUMANOID_ENEMIES,
  beast: BEAST_ENEMIES,
  undead: UNDEAD_ENEMIES,
  aberration: ABERRATION_ENEMIES,
  monstrosity: MONSTROSITY_ENEMIES,
  elemental: ELEMENTAL_ENEMIES,
} satisfies Record<EnemyFamily, Record<string, Entity>>

/** Every enemy key mapped to its family, derived from the slices so an entry's
 *  family is its directory and is never restated on the template. */
const ENEMY_FAMILY_BY_KEY: Record<string, EnemyFamily> = Object.fromEntries(
  ENEMY_FAMILIES.flatMap((family) =>
    Object.keys(SLICE_BY_FAMILY[family]).map((key) => [key, family])
  )
)

/** Resolves a catalog enemy's {@link EnemyFamily} from its `key`, or `undefined`
 *  when no enemy matches. */
export function getEnemyFamily(key: string): EnemyFamily | undefined {
  return ENEMY_FAMILY_BY_KEY[key]
}
