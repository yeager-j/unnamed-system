import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { EquippableItem, Item } from "@workspace/game-v2/items/item.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The catalog-lookup **port** the engine depends on, owned by the engine (the
 * consumer) per the Dependency Inversion Principle (D33, carried from v1's
 * `engine/ports`). It references only domain **type** shapes — type-only imports
 * are erased, so the engine gains **zero runtime dependency on the catalog**: the
 * `logic → catalog` value arrow is forbidden (enforced by `depcheck.mjs`), and
 * `catalog/` implements this interface structurally.
 *
 * This is the whole catalog surface; no consumer takes it directly. Each engine
 * function declares the **exact slice it calls** as an inline
 * `Pick<GameData, ...>`, so a signature documents precisely which lookups the
 * function touches and can never drift from the aggregate. The composition root
 * (`composition.ts`) binds the full adapter once.
 *
 * ## How the port grows
 *
 * Like {@link import("./component-registry").ComponentRegistry}, this is a
 * **grow-point**: each domain PR that needs a catalog lookup adds its method here
 * with a type-only import of the domain's shape — e.g. when `skills` lands:
 *
 * ```ts
 * import type { Skill } from "@workspace/game-v2/skills/skill.schema"
 * export interface GameData {
 *   getSkill(key: string): Skill | undefined   // ← added by the skills PR
 * }
 * ```
 *
 * `ports.ts` and `component-registry.ts` are the only kernel files permitted to
 * type-import a domain shape (they name domain types to declare the port/
 * registry). PR1 ships the seam empty — domains fill it as they land.
 *
 * The mechanics registry is **not** a data port: it is engine-owned behavior
 * dispatch over a closed key union (D17), so it stays a direct in-engine call,
 * never a `GameData` method.
 */
export interface GameData {
  /**
   * A catalog {@link Archetype} by key. `resolve` reads only the base-stat slice
   * (`attributes`/`affinities` for the active Archetype, `mastery` for the C4
   * mastery walk — the `ArchetypeBase` subset); the archetypes domain (UNN-504)
   * reads the full shape (skills, prerequisites, tier, …) for display/inheritance/
   * the Atlas. Returns `undefined` for an unknown key.
   */
  getArchetype(key: string): Archetype | undefined

  /**
   * The **whole** Archetype catalog, for the Lineage Atlas — it walks every
   * Archetype across all Lineages, not just a character's owned ones (UNN-504). The
   * app layer hides per-viewer-gated Archetypes via `hiddenArchetypeKeys`, so this
   * returns the full set.
   */
  allArchetypes(): Archetype[]

  /**
   * A catalog {@link Item} by key (PR5 — UNN-503). The item-mutation engine reads
   * `stackSize` (stacking/quantity) and inventory resolution joins rows to their
   * catalog entry. `undefined` for an unshipped key (engines drop misses).
   */
  getItem(key: string): Item | undefined

  /**
   * The **whole** Item catalog (UNN-559) — the add-item picker enumerates every
   * shipped item grouped by capability, the `allArchetypes` precedent. Setup/
   * display-time only; the mutation engine and `resolve` never call it.
   */
  allItems(): readonly Item[]

  /**
   * A catalog {@link EquippableItem} by key (PR5) — the equip-only narrowing the
   * equip swap + equipment contribution read (slot, `equip.effects`, weapon
   * `intrinsicAttack`). `undefined` for an unknown OR non-equippable key.
   */
  getEquippableItem(key: string): EquippableItem | undefined

  /**
   * A catalog {@link Skill} by key (PR5). The equipment contribution resolves a
   * granted-skill reference to the granted Skill's own effects. `undefined` for an
   * unshipped key.
   */
  getSkill(key: string): Skill | undefined

  /**
   * A catalog enemy template by key (UNN-514). This is a setup-time template
   * source only: session minting copies the returned authored flat-base
   * {@link Entity} into an inline combatant. `resolve` and loaders never call it.
   */
  getEnemy(key: string): Entity | undefined

  /**
   * The canonical starting weapon for an Origin {@link Lineage} (UNN-556) —
   * `undefined` while the Lineage's starter hasn't shipped, which finalize
   * surfaces as a structured refusal. Setup-time only (character finalization
   * seeds the equipment component with it); `resolve` never calls it.
   */
  startingWeaponForLineage(lineage: Lineage): string | undefined
}
