import { createGameEngine } from "@workspace/game-v2/composition"

/**
 * The **composition root for the v2 engine** (`@workspace/game-v2`) — the
 * parallel twin of {@link import("./game-engine")} while the two engines run
 * side by side (D32). {@link createGameEngine} binds the production catalog
 * adapter once; this module re-exports the pre-bound functions, so app code
 * never threads the catalog by hand and the binding stays confined here.
 *
 * Deliberately minimal: only the functions an app surface already consumes are
 * re-exported (UNN-530 binds `resolveSession` for the snapshot read boundary).
 * PR11 (UNN-510) grows this as the console/watch flip to v2.
 */
export const { resolveSession } = createGameEngine()
