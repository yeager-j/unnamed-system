import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  arbitraryGenerationLedger,
  arbitraryMintBatch,
} from "@workspace/game-v2/__fixtures__/arbitraries/generation"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"

import type { DungeonEvent } from "../dungeon-event"
import { createDungeonState, type DungeonState } from "../dungeon.schema"
import {
  generationLedgerSchema,
  type GenerationLedger,
} from "../generation-ledger.schema"
import { reduceDungeon } from "../reduce-dungeon"

/**
 * **The ledger round-trip** (UNN-590, D4): after applying a batch of
 * `recordMint`s, `revertMint`ing **any subset in any order** leaves exactly the
 * ledger of the un-reverted mints — with `streamCursors` untouched at every
 * step. Quantifying over *partial* reverts is the load-bearing choice: a
 * full-batch revert is order-insensitive even for a broken implementation
 * (every record still replays once), so only partial, non-LIFO reverts expose
 * the difference between replaying the **named** record and popping a stack —
 * which is exactly the PRD's any-unrevealed-leaf retract freedom, and what the
 * per-mint effects records exist to keep sound (aggregate counts cannot express
 * it). The negative control aims the same property at a plausible stack-pop
 * revert and demands red.
 */

const withLedger = (generation: GenerationLedger): DungeonState => ({
  ...createDungeonState(),
  generation,
})

/** ledger + a consistent mint batch + a shuffled subset of mints to revert. */
const arbitraryRoundTrip = arbitraryGenerationLedger.chain((ledger) =>
  arbitraryMintBatch(ledger).chain((mints) =>
    record({
      ledger: fc.constant(ledger),
      mints: fc.constant(mints),
      revertOrder: fc.shuffledSubarray(mints.map((_, i) => i)),
    })
  )
)

type RevertImpl = (
  state: DungeonState,
  event: Extract<DungeonEvent, { kind: "revertMint" }>
) => DungeonState

/** The partial-round-trip property, parameterized over the revert
 *  implementation so the negative control can aim it at a broken one. */
const revertRestoresLedger = (revert: RevertImpl) =>
  fc.property(arbitraryRoundTrip, ({ ledger, mints, revertOrder }) => {
    const base = withLedger(ledger)

    let state = base
    for (const mint of mints) {
      state = reduceDungeon(state, { kind: "recordMint", ...mint })
      expect(state.generation.streamCursors).toStrictEqual(
        base.generation.streamCursors
      )
    }
    for (const index of revertOrder) {
      state = revert(state, {
        kind: "revertMint",
        zoneId: mints[index]!.zoneId,
      })
      expect(state.generation.streamCursors).toStrictEqual(
        base.generation.streamCursors
      )
    }

    // The expected ledger: base plus only the mints that were NOT reverted,
    // applied in batch order (recordMints of distinct zones commute, so batch
    // order is a canonical representative).
    const reverted = new Set(revertOrder)
    let expected = base
    for (const [index, mint] of mints.entries()) {
      if (reverted.has(index)) continue
      expected = reduceDungeon(expected, { kind: "recordMint", ...mint })
    }

    expect(state.generation.declarations).toStrictEqual(
      expected.generation.declarations
    )
    expect(state.generation.mintedUniqueKeys).toStrictEqual(
      expected.generation.mintedUniqueKeys
    )
    expect(state.generation.mints).toStrictEqual(expected.generation.mints)
  })

describe("draw-ledger laws (UNN-590)", () => {
  it("recordMint* then revertMint over any subset in any order ≡ the un-reverted mints; cursors untouched", () => {
    fc.assert(revertRestoresLedger(reduceDungeon))
  })

  it("every generated ledger is a load-schema fixed point", () => {
    fc.assert(
      fc.property(arbitraryGenerationLedger, (ledger) => {
        expect(generationLedgerSchema.parse(ledger)).toStrictEqual(ledger)
      })
    )
  })
})

describe("negative control — the round-trip law can go red", () => {
  /**
   * A **stack-pop revert**: ignores the event's `zoneId` and reverts the
   * highest-sequence remaining mint — the "just undo the last one" shortcut.
   * Indistinguishable from the real revert under LIFO full unwinds; wrong the
   * moment retract targets any other unrevealed leaf.
   */
  const stackPopRevert: RevertImpl = (state, _event) => {
    const entries = Object.entries(state.generation.mints)
    if (entries.length === 0) return state
    const [topZoneId] = entries.reduce((a, b) =>
      a[1].sequence >= b[1].sequence ? a : b
    )
    return reduceDungeon(state, { kind: "revertMint", zoneId: topZoneId })
  }

  it("fails for a revert that pops instead of replaying the named record", () => {
    const result = fc.check(revertRestoresLedger(stackPopRevert), {
      numRuns: 500,
    })
    expect(result.failed).toBe(true)
  })
})
