import { getSkill } from "@workspace/game-v2/catalog/skills"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The authored content layer — the single adapter that implements the engine's
 * {@link GameData} port (D33). This is the **only** place (besides
 * `composition.ts`) permitted to be named by a `catalog` import; all engine logic
 * receives its lookups injected through the port, never by importing here.
 *
 * The Archetype catalog **content** is the archetypes domain PR's deliverable, so
 * PR2 (UNN-500) ships `getArchetype` as an empty stub (every key unknown). The
 * derivation **math** is what PR2 proves, against fixture archetypes in the
 * golden-master — not the real catalog. Each domain PR fills in its content +
 * lookup methods as it lands.
 *
 * The **Skill** catalog (`catalog/skills/`) is ported in PR-S (UNN-506); Item
 * content still awaits its migration.
 */
export const gameData: GameData = {
  getArchetype: () => undefined,
  // Item content is migrated later; the engine + port land now, stubbed unknown.
  getItem: () => undefined,
  getEquippableItem: () => undefined,
  getSkill,
}
