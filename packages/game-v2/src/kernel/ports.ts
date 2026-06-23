import type { ArchetypeBase } from "@workspace/game-v2/archetypes/archetype"

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
   * The base-stat slice of a catalog Archetype, by key (PR2 — UNN-500). `resolve`
   * reads `attributes`/`affinities` for the active Archetype and `mastery` for
   * every owned Archetype (the C4 mastery walk). The archetypes domain PR widens
   * the catalog Archetype around this slice. Returns `undefined` for an unknown key.
   */
  getArchetype(key: string): ArchetypeBase | undefined
}
