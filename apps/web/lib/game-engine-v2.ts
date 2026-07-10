import { createGameEngine } from "@workspace/game-v2/composition"

/**
 * The **composition root for the v2 engine** (`@workspace/game-v2`).
 * {@link createGameEngine} binds the production catalog adapter once; this
 * module re-exports the pre-bound functions, so app code never threads the
 * catalog by hand and the binding stays confined here.
 *
 * Deliberately minimal: only the functions an app surface already consumes are
 * re-exported (UNN-530 binds `resolveSession` for the snapshot read boundary;
 * the sheet reads `resolveEntity`).
 */
const engine = createGameEngine()

export const {
  resolveSession,
  resolveEntity,
  resolveBasicAttack,
  createSession,
  instantiateEnemy,
  // The builder's creation reads (S1 — UNN-556). Deps-bound only; pure no-deps
  // helpers (allocation validators, sortArchetypesByPath, path stats) are
  // imported straight from their @workspace/game-v2 barrels at call sites.
  creationArchetypes,
  previewArchetypeSkills,
  resolveTalentsForBuilder,
  // The sheet's Archetypes tab (S2d — UNN-560): the active-entry shaper, the
  // roster-entry builder its inheritance picker resolves source groups from,
  // and the lineage-grouped switcher options the rail's pill renders. Pure,
  // deps-free helpers (`inheritanceSourceGroups`, `isInheritableSkill`) are
  // imported straight from `@workspace/game-v2/archetypes/inheritance`.
  getArchetypeDisplay,
  buildArchetypeEntries,
  archetypeSwitcherGroups,
  // The Lineage Atlas growth surface (S3 — UNN-561): the tree/state shaper and
  // the Path-aware recommendation picker, both bound to the catalog here.
  buildLineageAtlas,
  getAtlasRecommendations,
  // The sheet's Talents card (S2b — UNN-558).
  resolveTalentsForSheet,
  // The sheet's Inventory tab (S2c — UNN-559): the display shaper + the
  // add-item picker's catalog enumeration. Writes go through the equipment
  // Writer (`lib/entity/commit/arms/inventory`), not this barrel.
  resolveInventory,
  allItems,
  startingWeaponForLineage,
  getArchetype,
  // The archetype write transitions the entity write door dispatches (UNN-595):
  // Origin minting, Inheritance-Slot fills, and the Saved-Rank economy — each
  // owns its rulebook rules in `game-v2/archetypes`, so the Writer arms are thin.
  applySetOrigin,
  applySetInheritanceSlot,
  applySpendArchetypeRank,
} = engine
