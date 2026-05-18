/**
 * A reusable two-state result for operations that can fail in expected,
 * domain-meaningful ways (as opposed to programmer errors, which still throw).
 * Engine modules return this instead of throwing so callers can branch on
 * `ok` and recover; the typed `E` lets each domain expose its own error codes.
 */

/**
 * Success carries a `value`; failure carries an `error`. `E` defaults to
 * `string` for casual call sites; domain code substitutes a string-literal
 * error-code union.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/** Builds a success result. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/** Builds a failure result. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
