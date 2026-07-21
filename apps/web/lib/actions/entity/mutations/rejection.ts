import type { EntityMutationRejection } from "./types"

/**
 * Reconstructs a stored terminal rejection for duplicate receipt recovery
 * (UNN-673/UNN-677). Every terminal rejection is a string literal; a structured
 * domain value in receipt JSON is corruption, not an expected outcome.
 */
export function parseEntityMutationRejection(
  value: unknown
): EntityMutationRejection {
  if (typeof value === "string") return value as EntityMutationRejection
  throw new Error(
    "headcanon entity receipt stored an invalid terminal rejection"
  )
}
