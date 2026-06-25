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
 */
export const gameData: GameData = {
  getArchetype: () => undefined,
  // Items + Skills content (PR5 — UNN-503) is migrated later, like the Archetype
  // catalog: the engines + the port land now, stubbed unknown; fixtures drive tests.
  getItem: () => undefined,
  getEquippableItem: () => undefined,
  getSkill: () => undefined,
}
