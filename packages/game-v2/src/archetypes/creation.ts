import type {
  Archetype,
  ArchetypeTier,
} from "@workspace/game-v2/archetypes/archetype"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The tier a character selects their Origin Archetype from at creation (rulebook
 * 1.3). Derived from the `ArchetypeTier` vocab — the entry tier — so the
 * creation-eligible set is a filter over the catalog, not a hand-maintained list.
 */
const CREATION_TIER: ArchetypeTier = "initiate"

/**
 * The roster rank an Origin Archetype is minted at — selecting an Origin
 * auto-sets Rank 2, unlocking its first two Skills (rulebook 1.3 / PRD §5.1).
 * Read by the `archetypes.setOrigin` Writer and the builder's skill preview.
 */
export const ORIGIN_ARCHETYPE_RANK = 2

/**
 * The Archetypes a character may take as their Origin at creation — the catalog
 * filtered to {@link CREATION_TIER} (replacing v1's static `INITIATE_ARCHETYPES`
 * constant; v2 reads the catalog through the `allArchetypes` port). Curried
 * deps-first, bound in the composition root.
 */
export function creationArchetypes(deps: Pick<GameData, "allArchetypes">) {
  return (): Archetype[] =>
    deps.allArchetypes().filter((archetype) => archetype.tier === CREATION_TIER)
}
