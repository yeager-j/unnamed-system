import type {
  Archetype,
  ArchetypeTier,
} from "@workspace/game-v2/archetypes/archetype"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { err, ok, type Result } from "@workspace/result"

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

/** An unknown Origin key — the sole failure mode; a valid key always mints. */
export type SetOriginError = "invalid-input"

/**
 * Mints (or replaces) the `archetypes` component for a chosen Origin — create-
 * from-absent and switch are the same move: the Origin roster entry is minted
 * fresh at {@link ORIGIN_ARCHETYPE_RANK} (v1's delete-and-replace parity),
 * preserving any banked Saved Ranks. Refuses `invalid-input` for a key the catalog
 * doesn't define, so no producer can author an Origin the game never shipped.
 *
 * Deliberately does NOT prune origin-granted Talents or reset Mechanics (a
 * progression-class patch must not span identity-/vitals-class columns, CH15):
 * Talent hygiene is the picker's display filter + finalize's prune, and mechanic
 * state is seeded at finalize (`resolve` falls back to `initialStateFor`
 * meanwhile). Returns the whole `archetypes` component (UNN-601); curried
 * deps-first, bound in the composition root.
 */
export function applySetOrigin(deps: Pick<GameData, "getArchetype">) {
  return (
    components: Partial<Pick<ComponentRegistry, "archetypes">>,
    archetypeKey: string
  ): Result<Pick<ComponentRegistry, "archetypes">, SetOriginError> => {
    if (deps.getArchetype(archetypeKey) === undefined) {
      return err("invalid-input")
    }
    return ok({
      archetypes: {
        active: archetypeKey,
        origin: archetypeKey,
        savedArchetypeRanks: components.archetypes?.savedArchetypeRanks ?? 0,
        roster: [
          {
            key: archetypeKey,
            rank: ORIGIN_ARCHETYPE_RANK,
            inheritanceSlots: [],
          },
        ],
      },
    })
  }
}
