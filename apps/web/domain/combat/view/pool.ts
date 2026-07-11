/**
 * A current/max pool — the shape both the HP and SP vitals bars render. The one
 * app-owned home for the display pool (UNN-583), shared by the roster, watch, and
 * dungeon token surfaces. The engine's `DungeonPool` is a structural peer this
 * can't absorb: the engine cannot depend on `apps/web`, so it keeps its own
 * identical shape and components read it structurally as a `Pool`.
 */
export interface Pool {
  current: number
  max: number
}
