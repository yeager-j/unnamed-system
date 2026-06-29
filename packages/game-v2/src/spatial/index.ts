/**
 * The `spatial/` public surface — the standalone Map-Instance spatial subsystem
 * (Tier 3). Re-homed from v1 onto v2 with zero `@workspace/game` imports (D32) and a
 * **one-way** dependency seam (SD2): `spatial/` imports `kernel/` + `mechanics/` only;
 * `encounter → spatial` is the legitimate direction (the composition tier reads
 * spatial). PR1 ships the state + event **shapes**; the reducers land in PR2/PR3.
 */
export * from "./geometry.schema"
export * from "./map-instance.schema"
export * from "./dungeon.schema"
export * from "./geometry-event"
export * from "./map-instance-event"
export * from "./dungeon-event"
