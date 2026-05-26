import type { PathChoice } from "../character"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type SuggestedPath,
} from "../lineage"
import type { Archetype } from "./schema"

/**
 * Path-responsive ordering for the Movement 1 Archetype grid (UNN-215 / ADR-002
 * §"Order — responsive to Path"). Three buckets keyed on each Lineage's
 * `LINEAGE_SUGGESTED_PATH`; the bucket order rotates so the Path the player
 * picked surfaces first:
 *
 * - `"health-focused"`  → health  → balanced → skill
 * - `"balanced"`        → balanced → health  → skill
 * - `"skill-focused"`   → skill   → balanced → health
 *
 * Within a bucket, Archetypes fall back to the canonical `LINEAGES` array order
 * (the rulebook order). When `pathChoice` is `null` — e.g. an entry-deep-link
 * lands before Path has been set — the whole grid renders in flat `LINEAGES`
 * order and the UI hides the "Sorted by fit with your X path." announcement.
 *
 * The sort never gates anything — every Archetype stays selectable regardless
 * of Path. An HP-Focused Mage is unusual but valid; the sort is *discovery*,
 * not *restriction*.
 */
const BUCKET_ORDER_BY_PATH: Record<
  PathChoice,
  readonly [SuggestedPath, SuggestedPath, SuggestedPath]
> = {
  "health-focused": ["health", "balanced", "skill"],
  balanced: ["balanced", "health", "skill"],
  "skill-focused": ["skill", "balanced", "health"],
}

const LINEAGE_ORDER: Record<(typeof LINEAGES)[number], number> =
  Object.fromEntries(
    LINEAGES.map((lineage, index) => [lineage, index])
  ) as Record<(typeof LINEAGES)[number], number>

export function sortArchetypesByPath(
  archetypes: readonly Archetype[],
  pathChoice: PathChoice | null
): Archetype[] {
  if (pathChoice === null) {
    return archetypes
      .slice()
      .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])
  }

  const bucketOrder = BUCKET_ORDER_BY_PATH[pathChoice]
  const bucketRank = {
    [bucketOrder[0]]: 0,
    [bucketOrder[1]]: 1,
    [bucketOrder[2]]: 2,
  } as Record<SuggestedPath, number>

  return archetypes.slice().sort((a, b) => {
    const aBucket = bucketRank[LINEAGE_SUGGESTED_PATH[a.lineage]]
    const bBucket = bucketRank[LINEAGE_SUGGESTED_PATH[b.lineage]]
    if (aBucket !== bBucket) return aBucket - bBucket
    return LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage]
  })
}
