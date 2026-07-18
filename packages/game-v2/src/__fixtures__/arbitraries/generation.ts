import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import type {
  Declaration,
  GenerationLedger,
  MintRecord,
} from "@workspace/game-v2/spatial/generation-ledger.schema"

/**
 * Ledger arbitraries for the UNN-590 draw-ledger laws. Same discipline as the
 * spatial arbitraries: every emitted value is a **fixed point of its load
 * schema** (defaulted fields present, optionals absent), and the generators stay
 * small — the round-trip claims are structural, so a handful of declarations and
 * mints exercises every branch while keeping counterexamples readable.
 */

/** `fc.tuple` rejects zero arms; this is the total version. */
const tupleOf = <T>(arms: fc.Arbitrary<T>[]): fc.Arbitrary<T[]> =>
  arms.length === 0 ? fc.constant([]) : fc.tuple(...arms)

const arbitraryDeclarationSpec = record({
  templateKey: fc.constantFrom("vault", "shrine", "throne"),
  minDepth: fc.nat({ max: 3 }),
  k: fc.integer({ min: 1, max: 6 }),
  secretSeed: fc.nat({ max: 97 }),
  qualifyingCount: fc.nat({ max: 4 }),
  resolved: fc.boolean(),
})

/** 0–3 declarations with distinct ids and creation-order sequences; some arrive
 *  already resolved (their draw landed in an earlier expansion). */
export const arbitraryDeclarations: fc.Arbitrary<Declaration[]> = fc
  .array(arbitraryDeclarationSpec, { maxLength: 3 })
  .map((specs) =>
    specs.map((spec, index) => ({
      id: `decl-${index}`,
      sequence: index,
      templateKey: spec.templateKey,
      minDepth: spec.minDepth,
      k: spec.k,
      secretIndex: (spec.secretSeed % spec.k) + 1,
      qualifyingCount: spec.qualifyingCount,
      ...(spec.resolved ? { resolvedZoneId: `prior-zone-${index}` } : {}),
    }))
  )

/** A mint-free ledger (mints land via {@link arbitraryMintBatch}). */
export const arbitraryGenerationLedger: fc.Arbitrary<GenerationLedger> = record(
  {
    seed: fc.constantFrom("seed-a", "seed-b", ""),
    streamCursors: fc.constantFrom<Record<string, number>>(
      {},
      { templates: 3 },
      { templates: 7, contents: 2, closure: 1 }
    ),
    declarations: arbitraryDeclarations,
    mintedUniqueKeys: fc.subarray(["base-unique-a", "base-unique-b"]),
    mints: fc.constant({}),
  }
)

/**
 * A batch of mutually consistent `recordMint` payloads over `ledger` — what the
 * roller could actually emit: distinct minted zoneIds, ascending sequences,
 * effects referencing real declarations, **at most one `resolved` per
 * declaration across the batch and none for an already-resolved one** (a
 * resolved declaration never re-draws), and `unique` keys distinct from each
 * other and from the base ledger's.
 */
export function arbitraryMintBatch(
  ledger: GenerationLedger
): fc.Arbitrary<{ zoneId: string; record: MintRecord }[]> {
  const perMintSpec = record({
    unique: fc.boolean(),
    effectFlags: tupleOf(
      ledger.declarations.map(() =>
        record({
          include: fc.boolean(),
          incremented: fc.boolean(),
          resolved: fc.boolean(),
        })
      )
    ),
  })
  return fc.array(perMintSpec, { maxLength: 4 }).map((specs) => {
    const resolvedTaken = new Set<string>()
    return specs.map((spec, index) => {
      const effects = ledger.declarations.flatMap((declaration, j) => {
        const flags = spec.effectFlags[j]!
        if (!flags.include) return []
        const resolved =
          flags.resolved &&
          declaration.resolvedZoneId === undefined &&
          !resolvedTaken.has(declaration.id)
        if (resolved) resolvedTaken.add(declaration.id)
        return [
          {
            declarationId: declaration.id,
            incremented: flags.incremented,
            resolved,
          },
        ]
      })
      return {
        zoneId: `mint-zone-${index}`,
        record: {
          sequence: 100 + index,
          templateKey: spec.unique ? `unique-${index}` : "hall",
          unique: spec.unique,
          effects,
        },
      }
    })
  })
}
