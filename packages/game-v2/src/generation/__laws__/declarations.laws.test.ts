import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createDungeonState } from "@workspace/game-v2/spatial/dungeon.schema"
import type {
  Declaration,
  GenerationLedger,
} from "@workspace/game-v2/spatial/generation-ledger.schema"
import { reduceDungeon } from "@workspace/game-v2/spatial/reduce-dungeon"

import { mintDeclarationEffects, scheduledDeclaration } from "../declarations"

const declaration = (
  sequence: number,
  overrides: Partial<Declaration> = {}
): Declaration => ({
  id: `declaration-${sequence}`,
  sequence,
  templateKey: `site-${sequence}`,
  minDepth: 0,
  k: 15,
  secretIndex: 1,
  qualifyingCount: 0,
  ...overrides,
})

const ledgerWith = (declarations: Declaration[]): GenerationLedger => ({
  seed: "law-seed",
  streamCursors: {},
  declarations,
  mintedUniqueKeys: [],
  mints: {},
})

function recordMint(
  ledger: GenerationLedger,
  templateKey: string,
  depth: number,
  sequence: number
): GenerationLedger {
  return reduceDungeon(
    { ...createDungeonState(), generation: ledger },
    {
      kind: "recordMint",
      zoneId: `zone-${sequence}`,
      record: {
        sequence,
        templateKey,
        unique: false,
        stub: {
          id: `stub-${sequence}`,
          zoneId: "parent",
          bearing: 0,
          anchor: { side: "e", offset: 0.5 },
        },
        childStubIds: [],
        effects: mintDeclarationEffects(ledger, depth, templateKey),
      },
    }
  ).generation
}

function qualify(
  ledger: GenerationLedger,
  depth: number,
  mintSequence: number
): GenerationLedger {
  const winner = scheduledDeclaration(ledger, depth)
  return recordMint(
    ledger,
    winner?.templateKey ?? `random-${mintSequence}`,
    depth,
    mintSequence
  )
}

describe("site declaration scheduler laws", () => {
  it("a no-collision declaration resolves on exactly its secret qualifying mint", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 8 }),
        (secretIndex, minDepth, ineligibleMints) => {
          let ledger = ledgerWith([declaration(0, { minDepth, secretIndex })])
          let sequence = 0
          for (let i = 0; i < ineligibleMints; i++) {
            ledger = qualify(ledger, minDepth - 1, sequence++)
          }
          expect(ledger.declarations[0]!.qualifyingCount).toBe(0)
          expect(ledger.declarations[0]!.resolvedZoneId).toBeUndefined()

          for (let index = 1; index <= secretIndex; index++) {
            ledger = qualify(ledger, minDepth, sequence++)
            expect(ledger.declarations[0]!.resolvedZoneId !== undefined).toBe(
              index === secretIndex
            )
          }
        }
      )
    )
  })

  it("a collision delays each declaration by its priority position", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 2, max: 6 }),
        (secretIndex, count) => {
          let ledger = ledgerWith(
            Array.from({ length: count }, (_, sequence) =>
              declaration(sequence, { secretIndex })
            )
          )
          for (let index = 1; index < secretIndex; index++) {
            ledger = qualify(ledger, 0, index - 1)
          }
          for (let delay = 0; delay < count; delay++) {
            ledger = qualify(ledger, 0, secretIndex - 1 + delay)
            const resolved = ledger.declarations
              .filter((item) => item.resolvedZoneId !== undefined)
              .map((item) => item.sequence)
            expect(resolved).toEqual(
              Array.from({ length: delay + 1 }, (_, sequence) => sequence)
            )
          }
        }
      )
    )
  })

  it("two queued K=1 declarations resolve on consecutive qualifying mints", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (minDepth) => {
        let ledger = ledgerWith([
          declaration(0, {
            templateKey: "first",
            minDepth,
            k: 1,
            secretIndex: 1,
          }),
          declaration(1, {
            templateKey: "second",
            minDepth,
            k: 1,
            secretIndex: 1,
          }),
        ])
        ledger = qualify(ledger, minDepth, 0)
        expect(ledger.declarations.map((item) => item.resolvedZoneId)).toEqual([
          "zone-0",
          undefined,
        ])
        ledger = qualify(ledger, minDepth, 1)
        expect(ledger.declarations.map((item) => item.resolvedZoneId)).toEqual([
          "zone-0",
          "zone-1",
        ])
      })
    )
  })
})

describe("negative control — collision priority law can go red", () => {
  const brokenWinner = (
    ledger: GenerationLedger,
    depth: number
  ): Declaration | undefined =>
    [...ledger.declarations]
      .filter(
        (item) =>
          item.resolvedZoneId === undefined &&
          depth >= item.minDepth &&
          item.qualifyingCount + 1 >= item.secretIndex
      )
      .sort((a, b) => b.sequence - a.sequence)[0]

  it("fails when due collisions choose newest-first", () => {
    const property = fc.property(fc.integer({ min: 2, max: 6 }), (count) => {
      const ledger = ledgerWith(
        Array.from({ length: count }, (_, sequence) => declaration(sequence))
      )
      expect(brokenWinner(ledger, 0)?.sequence).toBe(0)
    })
    expect(fc.check(property, { numRuns: 100 }).failed).toBe(true)
  })
})
