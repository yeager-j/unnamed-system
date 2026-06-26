import {
  allArchetypes,
  getArchetype,
} from "@workspace/game-v2/catalog/archetypes"
import { getSkill } from "@workspace/game-v2/catalog/skills"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The authored content layer — the single adapter that implements the engine's
 * {@link GameData} port (D33). This is the **only** place (besides
 * `composition.ts`) permitted to be named by a `catalog` import; all engine logic
 * receives its lookups injected through the port, never by importing here.
 *
 * The **Skill** catalog (`catalog/skills/`) is ported in PR-S (UNN-506) and the
 * **Archetype** catalog (`catalog/archetypes/`) in UNN-504; Item content still awaits
 * its migration.
 */
export const gameData: GameData = {
  getArchetype,
  allArchetypes,
  // Item content is migrated later; the engine + port land now, stubbed unknown.
  getItem: () => undefined,
  getEquippableItem: () => undefined,
  getSkill,
}
