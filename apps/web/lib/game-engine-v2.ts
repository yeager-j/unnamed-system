import { createGameEngine } from "@workspace/game-v2/composition"
import { gameData as v1GameData } from "@workspace/game/data"

import { createDeriveHydratedCharacterV2 } from "@/lib/game-v2/derive-hydrated-character"

/**
 * The **composition root for the v2 engine** (`@workspace/game-v2`) — the
 * parallel twin of {@link import("./game-engine")} while the two engines run
 * side by side (D32). {@link createGameEngine} binds the production catalog
 * adapter once; this module re-exports the pre-bound functions, so app code
 * never threads the catalog by hand and the binding stays confined here.
 *
 * Deliberately minimal: only the functions an app surface already consumes are
 * re-exported (UNN-530 binds `resolveSession` for the snapshot read boundary;
 * UNN-533 binds the sheet derivation). PR11 (UNN-510) grows this as the
 * console/watch flip to v2.
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
  // The sheet's Talents card (S2b — UNN-558).
  resolveTalentsForSheet,
  // The sheet's Inventory tab (S2c — UNN-559): the display shaper + the
  // add-item picker's catalog enumeration. Writes go through the equipment
  // Writer (`lib/entity/commit/arms/inventory`), not this barrel.
  resolveInventory,
  allItems,
  startingWeaponForLineage,
  getArchetype,
} = engine

/**
 * The v2-backed sheet derivation (UNN-533) — the one place the two engines meet:
 * v1 supplies the catalog joins the `HydratedCharacter` shape carries (items,
 * skills, talent names); v2 computes every derived value.
 * `lib/game-engine.ts` re-exports this as `deriveHydratedCharacter`.
 */
export const deriveHydratedCharacterV2 = createDeriveHydratedCharacterV2(
  v1GameData,
  engine
)
