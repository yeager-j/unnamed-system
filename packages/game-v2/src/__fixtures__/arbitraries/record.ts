import fc, { type RecordConstraints, type RecordValue } from "fast-check"

/**
 * `fc.record` with `noNullPrototype` forced on — same signature, one less footgun.
 *
 * By default fast-check sometimes emits `Object.create(null)` records: a useful
 * hostility for code that walks unknown objects, but *outside the domain these
 * laws quantify over*. A component bag always arrives from `JSON.parse` or a Zod
 * parse, both of which produce ordinary `Object.prototype` objects. Leaving it on
 * would make `toStrictEqual` (which compares prototypes) fail on values that are
 * observably identical, drowning the real signal — an undefined-valued key vs an
 * absent one — in noise.
 */
export function record<T, K extends keyof T = keyof T>(
  model: { [Key in keyof T]: fc.Arbitrary<T[Key]> },
  constraints?: RecordConstraints<K>
): fc.Arbitrary<RecordValue<T, K>> {
  return fc.record<T, K>(model, { ...constraints, noNullPrototype: true })
}
