import { type Archetype } from "@workspace/game/foundation/archetypes/schema"
import { type Talent } from "@workspace/game/foundation/character/talents/schema"
import {
  type EnemyDefinition,
  type EnemyFamily,
} from "@workspace/game/foundation/enemies/schema"
import {
  type EquippableItem,
  type Item,
} from "@workspace/game/foundation/items/schema"
import { type Skill } from "@workspace/game/foundation/skills/schema"

/**
 * The catalog-lookup **ports** the engine depends on, owned by the engine (the
 * consumer) per the Dependency Inversion Principle. They reference only
 * **foundation** domain types — type-only imports are erased, so the engine gains
 * **zero runtime dependency on the data layer**: the `engine → data` value-import
 * arrow flips, and the data layer implements these structurally (see
 * {@link import("@workspace/game/data/game-data").gameData}).
 *
 * Catalog access belongs only at the **assembly boundary** (UNN-354). A pure
 * derive function should take already-resolved domain data (the default — push the
 * lookup outward); a port is injected only where the lookup is genuinely
 * open-ended (walks the whole catalog) or reduce-time. Each consumer declares the
 * narrowest port it uses — often a one-method `Pick`.
 *
 * The mechanics registry (`engine/mechanics/registry`) is **not** a data port: it
 * is engine-owned behavior dispatch over a closed `MechanicKind` union, so
 * `getMechanic` stays a direct in-engine call.
 */

/** Resolves an Archetype by its slug key, plus the whole catalog (the Lineage
 *  Atlas and the unlock-archetype reducer walk every Archetype). */
export interface ArchetypeLookup {
  getArchetype(key: string): Archetype | undefined
  allArchetypes(): readonly Archetype[]
}

/** Resolves a Skill by its slug key. */
export interface SkillLookup {
  getSkill(key: string): Skill | undefined
}

/** Resolves a Talent by its slug key. */
export interface TalentLookup {
  getTalent(key: string): Talent | undefined
}

/** Resolves catalog items by slug key — any item, and the equippable narrowing. */
export interface ItemLookup {
  getItem(key: string): Item | undefined
  getEquippableItem(key: string): EquippableItem | undefined
}

/** Resolves catalog enemies by slug key, their {@link EnemyFamily}, and the whole
 *  catalog (the browse surface walks every enemy). */
export interface EnemyLookup {
  getEnemy(key: string): EnemyDefinition | undefined
  getEnemyFamily(key: string): EnemyFamily | undefined
  allEnemies(): readonly EnemyDefinition[]
}
