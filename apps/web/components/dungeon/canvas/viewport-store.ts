import type { Viewport } from "@xyflow/react"

/**
 * A tiny module-level store of the last React Flow viewport (zoom + pan) per
 * dungeon (UNN — run-console polish). The run console mounts a **fresh**
 * `DungeonCanvas` for each phase — Play, Setup, and (across a server
 * `router.refresh`) Combat — so without this every phase switch would refit the
 * board and reset the DM's zoom/pan. Keyed by the dungeon's `shortId`; survives
 * remounts and the soft navigation of `router.refresh` (the module stays loaded),
 * and resets naturally on a full page reload. Restored via `defaultViewport`,
 * saved on `onMoveEnd` — see {@link import("./dungeon-canvas").DungeonCanvas}.
 */
const viewportByDungeon = new Map<string, Viewport>()

export function readViewport(key: string): Viewport | undefined {
  return viewportByDungeon.get(key)
}

export function writeViewport(key: string, viewport: Viewport): void {
  viewportByDungeon.set(key, viewport)
}
