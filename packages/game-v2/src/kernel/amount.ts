/**
 * The neutral amount validator shared across the depletion surface. The engine
 * ships to the client and is directly callable, so a Server Action's Zod schema
 * is not a guaranteed chokepoint — a malformed amount reaching a pool operation
 * would smear a non-integer into a `z.number().int()` field and brick the row
 * against every later load. The guard is that backstop, homed once so the rest
 * transitions ({@link import("../resources/rest")}) and the atomic pool
 * operations ({@link import("../vitals/operations")}) share one predicate.
 */

/**
 * A magnitude — a player-entered spend, roll, heal, or SP amount — must be a
 * non-negative integer. `NaN` and `Infinity` fail {@link Number.isInteger} too,
 * so this one predicate rejects every malformed magnitude (fractional, negative,
 * `NaN`, `Infinity`) before it can reach a pool. Signed deltas (`applyDamage`'s
 * over-max grant) guard on `Number.isInteger` alone, not this.
 */
export const isNonNegativeInteger = (amount: number): boolean =>
  Number.isInteger(amount) && amount >= 0
