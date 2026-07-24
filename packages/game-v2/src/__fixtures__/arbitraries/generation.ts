import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { arbitraryPlacedGeometry } from "@workspace/game-v2/__fixtures__/arbitraries/spatial"
import { anchorFromBearing } from "@workspace/game-v2/generation/layout"
import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "@workspace/game-v2/generation/template-set.schema"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"
import { footprintOf } from "@workspace/game-v2/spatial/footprints"
import type {
  Declaration,
  GenerationLedger,
  MintRecord,
} from "@workspace/game-v2/spatial/generation-ledger.schema"
import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"

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
      templateKey: ["vault", "shrine", "throne"][index]!,
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
/** The 3-tag adjacency vocabulary the template-set arbitrary draws from. */
const TAG_VOCAB = ["cave", "hall", "crypt"] as const

/**
 * A small {@link TemplateSetContent} for the roll-expansion laws: 1–5 templates
 * with random tags/accepts (so two-way legality genuinely varies), weights in
 * {0, 1, 3} (0 exercises the never-random rule), unique/tombstoned flags, 0–3
 * exits with random optionality, a `closureChance` at the interesting points,
 * and an optional connector designation. Normalized through the load schema, so
 * every emitted value is a **fixed point by construction** (the transform
 * reconciles the order arrays; defaults land).
 */
export const arbitraryTemplateSet: fc.Arbitrary<TemplateSetContent> = fc
  .array(
    record({
      tags: fc.subarray([...TAG_VOCAB]),
      accepts: fc.subarray([...TAG_VOCAB]),
      weight: fc.constantFrom(0, 1, 3),
      unique: fc.boolean(),
      tombstoned: fc.boolean(),
      optionalExits: fc.array(fc.boolean(), { maxLength: 3 }),
    }),
    { minLength: 1, maxLength: 5 }
  )
  .chain((specs) =>
    record({
      specs: fc.constant(specs),
      closureChance: fc.constantFrom(0, 0.1, 1),
      connectorIndex: fc.option(fc.nat({ max: specs.length - 1 }), {
        nil: undefined,
      }),
    })
  )
  .map(({ specs, closureChance, connectorIndex }) => {
    const templates = Object.fromEntries(
      specs.map((spec, index) => [
        `t${index}`,
        {
          key: `t${index}`,
          tags: spec.tags,
          accepts: spec.accepts,
          weight: spec.weight,
          unique: spec.unique,
          ...(spec.tombstoned ? { tombstoned: true } : {}),
          exits: spec.optionalExits.map((optional) => ({ optional })),
        },
      ])
    )
    return templateSetContentSchema.parse({
      templates,
      closureChance,
      ...(connectorIndex === undefined
        ? {}
        : { connectorTemplateKey: `t${connectorIndex}` }),
    })
  })

/** One roll-expansion input: a mid-expedition instance whose zones are bound to
 *  set templates, at least one open stub, and a seeded ledger consistent with
 *  the set. See {@link arbitraryExpansionScenario}. */
export interface ExpansionScenario {
  set: TemplateSetContent
  instanceState: MapInstanceState
  ledger: GenerationLedger
  stubId: string
}

/**
 * The composite the roll-expansion laws quantify over: an
 * {@link arbitraryPlacedGeometry} whose zones each (maybe) bind a template from
 * an {@link arbitraryTemplateSet}, pages with random growth modes, a
 * self-consistent generation slice (all-authored provenance with random depths,
 * 1–4 stubs hung off bound zones, `startingZoneIds` ⊆ zone ids), and a ledger
 * with a non-empty seed, small pre-advanced cursors, `mintedUniqueKeys` drawn
 * from the set's unique templates, and no mints. The emitted instance state is
 * a load-schema fixed point (pinned as a meta-law).
 */
export const arbitraryExpansionScenario: fc.Arbitrary<ExpansionScenario> =
  record({
    set: arbitraryTemplateSet,
    geometry: arbitraryPlacedGeometry.filter(
      (geometry) => Object.keys(geometry.zones).length > 0
    ),
  }).chain(({ set, geometry }) => {
    const zoneIds = Object.keys(geometry.zones)
    const templateKeys = Object.keys(set.templates)
    const pageIds = Object.keys(geometry.pages)
    return record({
      set: fc.constant(set),
      geometry: fc.constant(geometry),
      growths: tupleOf(
        pageIds.map(() =>
          fc.option(fc.constantFrom<"edge" | "open">("edge", "open"), {
            nil: undefined,
          })
        )
      ),
      bindings: tupleOf(
        zoneIds.map(() =>
          fc.option(fc.nat({ max: templateKeys.length - 1 }), {
            nil: undefined,
          })
        )
      ),
      depths: tupleOf(zoneIds.map(() => fc.nat({ max: 4 }))),
      stubSpecs: fc.array(
        record({
          zoneIndex: fc.nat(),
          bearing: fc.double({
            min: -Math.PI,
            max: Math.PI,
            noNaN: true,
            noDefaultInfinity: true,
          }),
        }),
        { minLength: 1, maxLength: 4 }
      ),
      startingZoneIds: fc.subarray(zoneIds),
      seed: fc.constantFrom("seed-a", "seed-b", "seed-c"),
      cursors: fc.constantFrom<Record<string, number>>(
        {},
        { templates: 5 },
        { templates: 2, closure: 7 }
      ),
      uniqueSeeded: fc.subarray(
        templateKeys.filter((key) => set.templates[key]!.unique)
      ),
      stubPick: fc.nat(),
    }).map(
      ({
        set: pickedSet,
        geometry: baseGeometry,
        growths,
        bindings,
        depths,
        stubSpecs,
        startingZoneIds,
        seed,
        cursors,
        uniqueSeeded,
        stubPick,
      }) => {
        const pages = Object.fromEntries(
          pageIds.map((pageId, index) => [
            pageId,
            {
              ...baseGeometry.pages[pageId]!,
              ...(growths[index] === undefined
                ? {}
                : { growth: growths[index] }),
            },
          ])
        )
        const zones = Object.fromEntries(
          zoneIds.map((zoneId, index) => [
            zoneId,
            {
              ...baseGeometry.zones[zoneId]!,
              ...(bindings[index] === undefined
                ? {}
                : { templateKey: templateKeys[bindings[index]!]! }),
            },
          ])
        )
        const provenance = Object.fromEntries(
          zoneIds.map((zoneId, index) => [
            zoneId,
            { source: "authored" as const, depth: depths[index]! },
          ])
        )
        const stubs = Object.fromEntries(
          stubSpecs.map((spec, index) => {
            const id = `stub-${index}`
            const zoneId = zoneIds[spec.zoneIndex % zoneIds.length]!
            return [
              id,
              {
                id,
                zoneId,
                bearing: spec.bearing,
                // The real sprout derivation — a scenario stub is a stub the
                // substrate could actually have produced.
                anchor: anchorFromBearing(
                  footprintOf(baseGeometry.zones[zoneId]!.size),
                  spec.bearing
                ),
              },
            ]
          })
        )
        const instanceState = mapInstanceStateSchema.parse({
          geometry: { ...baseGeometry, pages, zones },
          occupancy: {},
          enchantment: null,
          reveal: {
            revealedZoneIds: [],
            revealedConnectionIds: [],
            unlockedConnectionIds: [],
          },
          generation: makeGenerationState({
            zones: provenance,
            stubs,
            startingZoneIds,
          }),
          lastMovedTokenKey: null,
        })
        const ledger: GenerationLedger = {
          seed,
          streamCursors: cursors,
          declarations: [],
          mintedUniqueKeys: [...uniqueSeeded].sort(),
          mints: {},
        }
        const stubIds = Object.keys(stubs)
        return {
          set: pickedSet,
          instanceState,
          ledger,
          stubId: stubIds[stubPick % stubIds.length]!,
        }
      }
    )
  })

export function arbitraryMintBatch(
  ledger: GenerationLedger
): fc.Arbitrary<{ zoneId: string; record: MintRecord }[]> {
  const perMintSpec = record({
    unique: fc.boolean(),
    childStubCount: fc.nat({ max: 1 }),
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
          stub: {
            id: `stub-${index}`,
            zoneId: `parent-zone-${index}`,
            bearing: index * 0.5,
            anchor: { side: "e" as const, offset: 0.5 },
          },
          childStubIds: spec.childStubCount === 0 ? [] : [`child-${index}-0`],
          effects,
        },
      }
    })
  })
}
