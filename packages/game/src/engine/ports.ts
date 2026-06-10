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
 * The catalog-lookup **port** the engine depends on, owned by the engine (the
 * consumer) per the Dependency Inversion Principle. It references only
 * **foundation** domain types — type-only imports are erased, so the engine gains
 * **zero runtime dependency on the data layer**: the `engine → data` value-import
 * arrow flips, and the data layer implements this structurally (see
 * {@link import("@workspace/game/data/game-data").gameData}).
 *
 * This is the whole catalog surface; no consumer takes it directly. Each engine
 * function declares the **exact slice it calls** as an inline
 * `Pick<GameData, ...>`, so a signature documents precisely which lookups the
 * function touches and can never drift from the aggregate. The full adapter
 * satisfies every slice structurally — {@link createGameEngine} binds it once at
 * the composition root.
 *
 * Catalog access belongs only at the **assembly boundary** (UNN-354). A pure
 * derive function should take already-resolved domain data (the default — push the
 * lookup outward); a port slice is injected only where the lookup is genuinely
 * open-ended (walks the whole catalog) or reduce-time.
 *
 * The mechanics registry (`engine/mechanics/registry`) is **not** a data port: it
 * is engine-owned behavior dispatch over a closed `MechanicKind` union, so
 * `getMechanic` stays a direct in-engine call.
 */
export interface GameData {
  /** Resolves an Archetype by its slug key. */
  getArchetype(key: string): Archetype | undefined
  /** The whole Archetype catalog (the Lineage Atlas and the unlock-archetype
   *  reducer walk every Archetype). */
  allArchetypes(): readonly Archetype[]
  /** Resolves a Skill by its slug key. */
  getSkill(key: string): Skill | undefined
  /** Resolves a Talent by its slug key. */
  getTalent(key: string): Talent | undefined
  /** Resolves a catalog item by its slug key. */
  getItem(key: string): Item | undefined
  /** Resolves a catalog item by its slug key, narrowed to equippables. */
  getEquippableItem(key: string): EquippableItem | undefined
  /** Resolves a catalog enemy by its slug key. */
  getEnemy(key: string): EnemyDefinition | undefined
  /** Resolves an enemy's {@link EnemyFamily} by the enemy's slug key. */
  getEnemyFamily(key: string): EnemyFamily | undefined
  /** The whole enemy catalog (the browse surface walks every enemy). */
  allEnemies(): readonly EnemyDefinition[]
}
