/**
 * The `spatial/` public surface — the standalone Map-Instance spatial subsystem
 * (Tier 3). Re-homed from v1 onto v2 with zero `@workspace/game` imports (D32) and a
 * **one-way** dependency seam (SD2): `spatial/` imports `kernel/` + `mechanics/` only;
 * `encounter → spatial` is the legitimate direction (the composition tier reads
 * spatial). PR1 ships the state + event **shapes**; PR2 adds the geometry + Map-Instance
 * reducers + the engagement-graph/occupancy write primitives; PR3 adds the
 * `reduceDungeon` exploration loop + its derived roster/reminder selectors, the
 * fog/reveal derivations (`connectionFogState`/`isFogActive`/…), and the pure
 * `MapInstanceState` selectors (`zoneOf`/`activeEnchantment`/`engagementOf`) the
 * combat composition binds its `SpatialReads` adapter from (SD8).
 */
export * from "./geometry.schema"
export * from "./geometry-warnings"
export * from "./instance-factory"
export * from "./map-instance.schema"
export * from "./resolve-zone-exits"
export * from "./dungeon.schema"
export * from "./geometry-event"
export * from "./map-instance-event"
export * from "./dungeon-event"
export * from "./engagement-graph"
export * from "./reduce-map-geometry"
export * from "./occupancy"
export * from "./reduce-map-instance"
export * from "./reduce-dungeon"
export * from "./reveal"
export * from "./selectors"
