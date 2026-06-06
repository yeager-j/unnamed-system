import { describe, expectTypeOf, it } from "vitest"

import {
  characterArchetypes,
  characterChains,
  characterKnives,
  characters,
  inventoryItems,
  type CharacterArchetypeRow,
  type CharacterChainRow,
  type CharacterKnifeRow,
  type CharacterRow,
  type InventoryItemRow,
} from "./character"

/**
 * Drift guard for the type-ownership inversion (Step 0, docs/engine-reorg): the
 * game domain owns the persisted-record shapes (`@workspace/game/foundation` →
 * records.ts) and the Drizzle tables here must conform. These are type-level
 * assertions — a column added or changed without updating the game record fails
 * `npm run typecheck` (and this suite), so the two can never silently drift.
 */
describe("persisted table ⇔ game record conformance", () => {
  it("character row", () => {
    expectTypeOf<typeof characters.$inferSelect>().toEqualTypeOf<CharacterRow>()
  })

  it("characterArchetype row", () => {
    expectTypeOf<
      typeof characterArchetypes.$inferSelect
    >().toEqualTypeOf<CharacterArchetypeRow>()
  })

  it("inventoryItem row", () => {
    expectTypeOf<
      typeof inventoryItems.$inferSelect
    >().toEqualTypeOf<InventoryItemRow>()
  })

  it("characterKnife row", () => {
    expectTypeOf<
      typeof characterKnives.$inferSelect
    >().toEqualTypeOf<CharacterKnifeRow>()
  })

  it("characterChain row", () => {
    expectTypeOf<
      typeof characterChains.$inferSelect
    >().toEqualTypeOf<CharacterChainRow>()
  })
})
