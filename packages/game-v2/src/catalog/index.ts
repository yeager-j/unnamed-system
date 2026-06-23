import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The authored content layer — the single adapter that implements the engine's
 * {@link GameData} port (D33). This is the **only** place (besides
 * `composition.ts`) permitted to be named by a `catalog` import; all engine logic
 * receives its lookups injected through the port, never by importing here.
 *
 * PR1 ships the seam with the port empty, so the adapter is an empty object that
 * structurally satisfies it. Each domain PR adds its catalog content + the
 * matching lookup methods as it lands.
 */
export const gameData: GameData = {}
