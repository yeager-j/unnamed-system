import type { CausalRelationship } from "@workspace/replica/transport"

import type { VersionClass } from "@/lib/db/version-classes"

/**
 * The entity's causal cursor at the replica's transport seam: the per-class
 * version columns read together as one vector (UNN-639, design §Showtime
 * binding). The replica core never interprets it; only
 * {@link compareEntityVersionVectors} does.
 */
export type EntityVersionVector = Readonly<
  Partial<Record<VersionClass, number>>
>

/**
 * Product order over the class dimensions. Two snapshots from racing reads can
 * genuinely disagree per class (one read saw a newer `identity`, the other a
 * newer `vitals`); that mixed case is `unknown`, and the acceptance gate
 * answers it with a recovery read instead of guessing.
 */
export function compareEntityVersionVectors(
  previous: EntityVersionVector,
  incoming: EntityVersionVector
): CausalRelationship {
  let ahead = false
  let behind = false
  const dimensions = new Set([
    ...Object.keys(previous),
    ...Object.keys(incoming),
  ]) as Set<VersionClass>
  for (const dimension of dimensions) {
    const before = previous[dimension] ?? 0
    const after = incoming[dimension] ?? 0
    if (after > before) ahead = true
    else if (after < before) behind = true
  }
  if (ahead && behind) return "unknown"
  if (ahead) return "fresh"
  if (behind) return "stale"
  return "same"
}
