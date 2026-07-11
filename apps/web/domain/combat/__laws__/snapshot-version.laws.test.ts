import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  foldSnapshotVersion,
  type SnapshotVersionInputs,
} from "@/domain/combat/snapshot-version"

/**
 * **The snapshot-version laws** (UNN-602). `foldSnapshotVersion` is correct
 * iff it satisfies exactly two properties, both quantified here over
 * *arbitrary* entity ids — not just the nanoid/UUID alphabet production
 * happens to mint today:
 *
 * - **Injectivity**: distinct inputs never fold to the same string. This is
 *   the watch's whole correctness story — the stale-compare is a single
 *   equality check, so a collision silently skips an update.
 * - **Determinism**: Map insertion order is immaterial (the sort contract),
 *   so two loads of the same state always compare equal.
 *
 * Ids are drawn with a hostile bias: full-unicode strings plus a tiny
 * alphabet dense in the old encoding's `,`/`:`/`.` delimiters and `e`/`i`/`d`
 * prefixes, so the generators structurally reach the collision and
 * sort-instability edges instead of hoping for them. The pinned example is
 * the exact forgery the pre-UNN-602 delimiter-joined encoding produced.
 */
const id = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary", maxLength: 8 }),
  fc.string({
    unit: fc.constantFrom("a", "b", "e", "i", "d", ",", ":", ".", "1", "-"),
    maxLength: 6,
  })
)

const durableEntries = fc.uniqueArray(fc.tuple(id, fc.integer()), {
  selector: ([entityId]) => entityId,
})

const inputs: fc.Arbitrary<SnapshotVersionInputs> = fc.record({
  encounterVersion: fc.integer(),
  instanceVersion: fc.integer(),
  durableVersions: durableEntries.map((entries) => new Map(entries)),
})

/** Structural input equality — independent of the fold's encoding. */
function sameInputs(a: SnapshotVersionInputs, b: SnapshotVersionInputs) {
  if (a.encounterVersion !== b.encounterVersion) return false
  if (a.instanceVersion !== b.instanceVersion) return false
  if (a.durableVersions.size !== b.durableVersions.size) return false
  for (const [entityId, version] of a.durableVersions) {
    if (!b.durableVersions.has(entityId)) return false
    if (b.durableVersions.get(entityId) !== version) return false
  }
  return true
}

describe("foldSnapshotVersion laws (UNN-602)", () => {
  it("injectivity: distinct inputs fold to distinct strings", () => {
    fc.assert(
      fc.property(inputs, inputs, (a, b) => {
        fc.pre(!sameInputs(a, b))
        expect(foldSnapshotVersion(a)).not.toBe(foldSnapshotVersion(b))
      })
    )
  })

  it("injectivity: the delimiter forgery the old encoding collided on", () => {
    const forged: SnapshotVersionInputs = {
      encounterVersion: 1,
      instanceVersion: 1,
      durableVersions: new Map([["a:1,b", 2]]),
    }
    const honest: SnapshotVersionInputs = {
      encounterVersion: 1,
      instanceVersion: 1,
      durableVersions: new Map([
        ["a", 1],
        ["b", 2],
      ]),
    }
    expect(foldSnapshotVersion(forged)).not.toBe(foldSnapshotVersion(honest))
  })

  it("determinism: Map insertion order is immaterial", () => {
    const shuffledPair = durableEntries.chain((entries) =>
      fc.tuple(
        fc.constant(entries),
        fc.shuffledSubarray(entries, { minLength: entries.length })
      )
    )
    fc.assert(
      fc.property(
        shuffledPair,
        fc.integer(),
        fc.integer(),
        ([entries, shuffled], encounterVersion, instanceVersion) => {
          const fold = (order: typeof entries) =>
            foldSnapshotVersion({
              encounterVersion,
              instanceVersion,
              durableVersions: new Map(order),
            })
          expect(fold(entries)).toBe(fold(shuffled))
        }
      )
    )
  })
})
