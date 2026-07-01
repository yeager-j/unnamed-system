/**
 * Order-independent structural equality over plain JSON values (primitives,
 * arrays, nested objects) — the engine's persisted shapes, so a small recursive
 * walk suffices. Exists to honor the **no-op same-ref contract** (R24.1): a
 * sweep/reset compares its rebuilt output against the input and returns the
 * original reference when nothing changed. Not for values with prototypes,
 * `Map`/`Set`, or cycles.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  )
}
