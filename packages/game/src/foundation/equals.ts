/**
 * `true` only when `A` and `B` are mutually assignable (structurally equal) — the
 * structural-equality primitive the foundation's compile-time *lockstep guards*
 * assert with: a hand-written union vs its Zod schema's inferred type, a `kind`
 * list vs the union it covers. Shared so the event modules don't each re-declare
 * it (the only consumers are foundation-internal `_*InSync` assertions).
 */
export type Equals<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false
