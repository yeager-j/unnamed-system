import type {
  GenerationState,
  MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"

/**
 * The **start-time provenance stamp** of the ledger law (procedural-dungeons tech
 * design D5). Called **once** at expedition start on the fresh seed-Map snapshot,
 * *before* any generation roll: every Zone the snapshot carries is authored, so
 * every current geometry Zone is stamped `{ source: "authored" }`.
 *
 * Authored provenance is what later lets `foldExpedition` decide which revealed
 * Zones fold back to the Region's `staticReveal` — a stable place the party mapped
 * is worth carrying forward; generated and manual space (stamped later, in the
 * reducer / by the roller) is visit-scoped and never folds. Because the snapshot is
 * fresh (no generated or manual Zones exist yet), replacing `generation.zones`
 * wholesale is exactly right; `grafts` is preserved untouched.
 *
 * Returns a **fresh** state — it does not mutate its input (the caller threads it
 * through the expedition-start transaction). P3 grows this module: authored `depth`
 * is recomputed here (multi-source shortest path from the party's starting Zones).
 */
export function withAuthoredProvenance(
  state: MapInstanceState
): MapInstanceState {
  const zones: GenerationState["zones"] = {}
  for (const zoneId of Object.keys(state.geometry.zones)) {
    zones[zoneId] = { source: "authored" }
  }
  return {
    ...state,
    generation: { ...state.generation, zones },
  }
}
