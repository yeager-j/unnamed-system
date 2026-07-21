import type { EntityMutationRejection } from "./types"

/**
 * Reconstructs a stored terminal rejection for duplicate receipt recovery
 * (UNN-673). Every {@link EntityMutationRejection} member is a string literal, so
 * the JSON round-trip is lossless and a non-string stored value is a corruption
 * fault rather than an expected outcome. (If a Writer refusal ever becomes an
 * object, this parser must gain a schema — its string assumption is load-bearing.)
 */
export function parseEntityMutationRejection(
  value: unknown
): EntityMutationRejection {
  if (typeof value === "string") return value as EntityMutationRejection
  throw new Error(
    "headcanon entity receipt stored a non-string terminal rejection"
  )
}
