/**
 * The seeded **generation RNG** (procedural-dungeons tech design D6, UNN-590) —
 * one seed per expedition, consumed as **named streams**: each purpose hashes
 * `(seed, purpose)` into an independent base state, so an extra contents roll
 * never shifts the template sequence for the same seed.
 *
 * Implementation: **counter-mode splitmix32**. Draw *i* of a stream is the
 * splitmix32 finalizer applied to `base + (cursor + i) · φ32` — O(1) random
 * access, which makes cursor-resume trivial (no skip loop): a stream opened at
 * cursor *c* continues exactly where a fresh stream left off after *c* draws.
 * That property is the mechanism behind the ledger's never-rewind rule
 * (`streamCursors` only ever advance; `revertMint` never rewinds — a re-expand
 * after retract must roll a *different* result, D4).
 *
 * The port downstream code consumes is `() => number` (uniform [0, 1)); tests
 * inject constants (D1).
 */

/** The `() => number` port — uniform in [0, 1). */
export type Rng = () => number

/**
 * The canonical stream purposes (D6): template draws, zone-contents rolls, loop
 * closure, and site declarations' due draws. The cursor record is deliberately
 * open (`Record<string, number>`) — these constants are the vocabulary, not a
 * closed set.
 */
export const RNG_PURPOSES = [
  "templates",
  "contents",
  "closure",
  "draws",
] as const
export type RngPurpose = (typeof RNG_PURPOSES)[number]

/**
 * One named stream: `next` draws the next value; `consumed()` reports how many
 * values this instance has drawn — the count the caller folds into the ledger's
 * `streamCursors` (via `advanceCursors`, or directly into the initial blob at
 * expedition start).
 */
export interface RngStream {
  next: Rng
  consumed: () => number
}

/** 32-bit golden-ratio increment (φ32) — the splitmix counter step. */
const GOLDEN = 0x9e3779b9

/** An xmur3-style string hash: `(seed, purpose)` → 32-bit stream base. */
function streamBase(seed: string, purpose: string): number {
  const input = `${seed}\u0000${purpose}`
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/** The splitmix32 finalizer — avalanches a 32-bit state into a 32-bit output. */
function finalize(state: number): number {
  let z = state | 0
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  return (z ^ (z >>> 15)) >>> 0
}

/**
 * Opens the `(seed, purpose)` stream at `cursor` (default 0 — a fresh
 * expedition). Deterministic: same seed, purpose, and cursor ⇒ same sequence.
 */
export function makeStream(
  seed: string,
  purpose: string,
  cursor = 0
): RngStream {
  const base = streamBase(seed, purpose)
  let drawn = 0
  return {
    next: () => {
      const counter = (base + Math.imul(cursor + drawn, GOLDEN)) | 0
      drawn += 1
      return finalize(counter) / 0x1_0000_0000
    },
    consumed: () => drawn,
  }
}
