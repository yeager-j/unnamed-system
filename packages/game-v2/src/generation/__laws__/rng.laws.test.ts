import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"

import { makeStream, RNG_PURPOSES } from "../rng"

/**
 * **Named-stream RNG laws** (UNN-590, D6). The design's central claim — one
 * seed, independent per-purpose streams — quantified over seeds, purposes, and
 * draw counts. Stream independence is the property the whole cursor design
 * hangs off: an extra contents roll must never shift the template sequence, and
 * cursor-resume is the mechanism behind the ledger's never-rewind rule.
 */

const arbitrarySeed = fc.string({ maxLength: 24 })
const arbitraryPurpose = fc.constantFrom(...RNG_PURPOSES)
const arbitraryDraws = fc.integer({ min: 1, max: 40 })

const draws = (seed: string, purpose: string, count: number, cursor = 0) => {
  const stream = makeStream(seed, purpose, cursor)
  return Array.from({ length: count }, () => stream.next())
}

describe("rng laws (UNN-590)", () => {
  it("determinism: same seed, purpose, and cursor ⇒ the same sequence", () => {
    fc.assert(
      fc.property(
        record({
          seed: arbitrarySeed,
          purpose: arbitraryPurpose,
          count: arbitraryDraws,
        }),
        ({ seed, purpose, count }) => {
          expect(draws(seed, purpose, count)).toEqual(
            draws(seed, purpose, count)
          )
        }
      )
    )
  })

  it("stream independence: k extra draws on one purpose never shift another's sequence", () => {
    fc.assert(
      fc.property(
        record({
          seed: arbitrarySeed,
          count: arbitraryDraws,
          extra: fc.integer({ min: 1, max: 40 }),
        }),
        ({ seed, count, extra }) => {
          // Baseline: templates drawn alone.
          const baseline = draws(seed, "templates", count)
          // Interleaved: consume the contents stream first (an extra start-time
          // contents roll), then draw templates.
          const contents = makeStream(seed, "contents", 0)
          for (let i = 0; i < extra; i++) contents.next()
          expect(draws(seed, "templates", count)).toEqual(baseline)
        }
      )
    )
  })

  it("cursor-resume: a stream opened at cursor c continues a fresh stream after c draws", () => {
    fc.assert(
      fc.property(
        record({
          seed: arbitrarySeed,
          purpose: arbitraryPurpose,
          c: fc.integer({ min: 0, max: 30 }),
          count: arbitraryDraws,
        }),
        ({ seed, purpose, c, count }) => {
          const whole = draws(seed, purpose, c + count)
          const resumed = draws(seed, purpose, count, c)
          expect(resumed).toEqual(whole.slice(c))
        }
      )
    )
  })

  it("range: every draw is in [0, 1)", () => {
    fc.assert(
      fc.property(
        record({
          seed: arbitrarySeed,
          purpose: arbitraryPurpose,
          count: arbitraryDraws,
        }),
        ({ seed, purpose, count }) => {
          for (const value of draws(seed, purpose, count)) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
          }
        }
      )
    )
  })

  it("consumed() reports the local draw count", () => {
    fc.assert(
      fc.property(
        record({
          seed: arbitrarySeed,
          purpose: arbitraryPurpose,
          count: fc.integer({ min: 0, max: 20 }),
          cursor: fc.integer({ min: 0, max: 20 }),
        }),
        ({ seed, purpose, count, cursor }) => {
          const stream = makeStream(seed, purpose, cursor)
          for (let i = 0; i < count; i++) stream.next()
          expect(stream.consumed()).toBe(count)
        }
      )
    )
  })

  it("distinct purposes produce distinct sequences for the same seed", () => {
    // Not a strict mathematical necessity for a hash, but a sanity floor: if two
    // canonical purposes ever collide over 8 draws the stream hash is broken.
    fc.assert(
      fc.property(arbitrarySeed, (seed) => {
        expect(draws(seed, "templates", 8)).not.toEqual(
          draws(seed, "contents", 8)
        )
      })
    )
  })
})
