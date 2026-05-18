import type { CastingCharacter } from "../game/skill-cost"
import { loadHydratedCharacter } from "./load-character"

/**
 * Loads the {@link CastingCharacter} the derived-value engine and cast
 * pre-check consume: the pure derived-value view plus the live
 * `currentHP`/`currentSP` pools. Hydration is owned by the neutral
 * {@link loadHydratedCharacter}; its result is a structural superset of
 * `CastingCharacter`, so it is returned directly. `null` when no character has
 * that id.
 */
export async function loadStatComputationCharacter(
  characterId: string
): Promise<CastingCharacter | null> {
  return loadHydratedCharacter(characterId)
}
