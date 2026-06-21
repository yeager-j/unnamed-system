/**
 * Shared React Flow grid constants for every canvas (UNN-486). One source of truth
 * so the **background dot spacing matches the node snap step** and looks identical
 * across the Map editor, the dungeon Play board, the Edit board, and the player fog
 * view — toggling Edit ⇄ Play must not shift the dots.
 *
 * `CANVAS_GRID_SIZE` is both the `<Background gap>` (dot spacing) and the
 * `snapGrid` step, so a snapped node always lands on a dot. `CANVAS_DOT_SIZE` is
 * the dot radius.
 */
export const CANVAS_GRID_SIZE = 16

export const CANVAS_DOT_SIZE = 1
