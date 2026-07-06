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
 * The Archetypes a character may take as their Origin at creation — the catalog
 * filtered to {@link CREATION_TIER} (replacing v1's static `INITIATE_ARCHETYPES`
 * constant; v2 reads the catalog through the `allArchetypes` port). Curried
 * deps-first, bound in the composition root.
 */
export function creationArchetypes(deps: Pick<GameData, "allArchetypes">) {
  return (): Archetype[] =>
    deps.allArchetypes().filter((archetype) => archetype.tier === CREATION_TIER)
}
