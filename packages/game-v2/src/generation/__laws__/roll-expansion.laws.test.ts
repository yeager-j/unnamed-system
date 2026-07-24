import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  arbitraryExpansionScenario,
  arbitraryTemplateSet,
  type ExpansionScenario,
} from "@workspace/game-v2/__fixtures__/arbitraries/generation"
import { reduceInstance } from "@workspace/game-v2/spatial/__fixtures__/spatial"
import { createDungeonState } from "@workspace/game-v2/spatial/dungeon.schema"
import {
  footprintOf,
  rectOfZone,
  rectsOverlap,
  sideBetween,
  type Rect,
} from "@workspace/game-v2/spatial/footprints"
import {
  generationLedgerSchema,
  type GenerationLedger,
} from "@workspace/game-v2/spatial/generation-ledger.schema"
import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"
import { reduceDungeon } from "@workspace/game-v2/spatial/reduce-dungeon"

import { anchorFromBearing, edgeHalfPlane, inHalfPlane } from "../layout"
import { pairLegal } from "../lint"
import { buildRetraction } from "../retract"
import { rollExpansion, type ExpansionOutcome } from "../roll-expansion"
import { templateSetContentSchema } from "../template-set.schema"

/**
 * **Expand-loop laws** (UNN-642, D1/D4/D6/D8/D10), quantified over
 * {@link arbitraryExpansionScenario}. The two subtle families carry negative
 * controls per the 2026-07-18 lesson (a full-round-trip inverse law passes for
 * a broken inverse; only partial reverts and rewound cursors have teeth):
 *
 * - the retract family quantifies over **partial shuffled subsets** of sibling
 *   mints (the stack-pop control lives in `spatial/__laws__/ledger.laws.test.ts`
 *   and covers the reducer half);
 * - the differ-after-retract family's control **manually rewinds the cursors**
 *   and demands the identical first outcome back — proving the escape hatch's
 *   teeth live entirely in the never-rewind rule.
 */

/** A deterministic id factory — recreated per call site so two rolls that must
 *  agree can be given identical id sequences. */
const counterIds = (prefix: string) => {
  let n = 0
  return () => `${prefix}-${n++}`
}

/** Rolls the scenario once with a fresh counter factory. */
const roll = (scenario: ExpansionScenario, prefix = "gen") =>
  rollExpansion(
    {
      set: scenario.set,
      instanceState: scenario.instanceState,
      ledger: scenario.ledger,
      stubId: scenario.stubId,
      newId: counterIds(prefix),
    },
    undefined
  )

/** Folds an outcome into both aggregates. */
function fold(
  instanceState: MapInstanceState,
  ledger: GenerationLedger,
  outcome: ExpansionOutcome
): { instanceState: MapInstanceState; ledger: GenerationLedger } {
  let nextInstance = instanceState
  for (const event of outcome.instanceEvents) {
    nextInstance = reduceInstance(nextInstance, event)
  }
  let dungeon = { ...createDungeonState(), generation: ledger }
  for (const event of outcome.dungeonEvents) {
    dungeon = reduceDungeon(dungeon, event)
  }
  return { instanceState: nextInstance, ledger: dungeon.generation }
}

const consumedOf = (outcome: ExpansionOutcome): Record<string, number> => {
  const event = outcome.dungeonEvents.find(
    (candidate) => candidate.kind === "advanceCursors"
  )
  return event?.kind === "advanceCursors" ? event.consumed : {}
}

describe("rollExpansion laws — totality and the consumption table", () => {
  it("a valid stub always resolves: one instance event; events and cursors match the outcome", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const result = roll(scenario)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        const { instanceEvents, dungeonEvents } = result.value
        expect(instanceEvents).toHaveLength(1)
        const outcome = instanceEvents[0]!
        const consumed = consumedOf(result.value)

        switch (outcome.kind) {
          case "mintZone": {
            expect(dungeonEvents.map((event) => event.kind)).toEqual(
              dungeonEvents.length === 3
                ? ["advanceTurn", "recordMint", "advanceCursors"]
                : ["advanceTurn", "recordMint"]
            )
            // Random path: always the 1 unconditional closure draw. The
            // templates count varies by sub-path (pick + culls vs a
            // connector-fallback mint of a cull-free template, which draws
            // none) — the per-path exact counts are pinned by the unit tests.
            expect(consumed["closure"]).toBe(1)
            break
          }
          case "closeLoop":
          case "resolveDeadEnd": {
            // Free and non-qualifying: no turn, no record — cursors only.
            expect(dungeonEvents.map((event) => event.kind)).toEqual([
              "advanceCursors",
            ])
            expect(consumed["closure"]).toBe(1)
            break
          }
          default:
            throw new Error(`unexpected outcome ${outcome.kind}`)
        }
        // Every consumed count is a positive integer (the schema's contract).
        for (const count of Object.values(consumed)) {
          expect(Number.isInteger(count)).toBe(true)
          expect(count).toBeGreaterThan(0)
        }
      })
    )
  })

  it("is deterministic: identical deps (and id sequences) ⇒ identical outcomes", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        expect(roll(scenario)).toStrictEqual(roll(scenario))
      })
    )
  })

  it("never mutates its inputs", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const instanceSnapshot = structuredClone(scenario.instanceState)
        const ledgerSnapshot = structuredClone(scenario.ledger)
        roll(scenario)
        expect(scenario.instanceState).toStrictEqual(instanceSnapshot)
        expect(scenario.ledger).toStrictEqual(ledgerSnapshot)
      })
    )
  })
})

describe("rollExpansion laws — every random mint is legal", () => {
  it("mints only two-way-accepts-legal, non-tombstoned, unique-fresh templates; connector included", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const result = roll(scenario)
        if (!result.ok) return
        const outcome = result.value.instanceEvents[0]!
        if (outcome.kind !== "mintZone") return

        const mintedKey = outcome.zone.templateKey!
        const minted = scenario.set.templates[mintedKey]!
        expect(minted).toBeDefined()
        expect(minted.tombstoned).not.toBe(true)
        if (minted.unique) {
          expect(scenario.ledger.mintedUniqueKeys).not.toContain(mintedKey)
        }
        const parentZone =
          scenario.instanceState.geometry.zones[
            scenario.instanceState.generation.stubs[scenario.stubId]!.zoneId
          ]!
        const parentTemplate = scenario.set.templates[parentZone.templateKey!]!
        expect(pairLegal(parentTemplate, minted)).toBe(true)
      })
    )
  })

  it("layout invariants hold through the roller: no overlap, half-plane, anchor side, child anchors", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const result = roll(scenario)
        if (!result.ok) return
        const outcome = result.value.instanceEvents[0]!
        if (outcome.kind !== "mintZone") return

        const geometry = scenario.instanceState.geometry
        const stub = scenario.instanceState.generation.stubs[scenario.stubId]!
        const parent = geometry.zones[stub.zoneId]!
        const mintedRect: Rect = {
          x: outcome.zone.position.x,
          y: outcome.zone.position.y,
          ...footprintOf(outcome.zone.size),
        }
        for (const zone of Object.values(geometry.zones)) {
          if (zone.pageId !== outcome.zone.pageId) continue
          expect(rectsOverlap(mintedRect, rectOfZone(zone))).toBe(false)
        }
        expect(sideBetween(rectOfZone(parent), mintedRect)).toBe(
          stub.anchor.side
        )
        const growth = geometry.pages[outcome.zone.pageId]?.growth ?? "edge"
        if (growth === "edge") {
          const halfPlane = edgeHalfPlane(
            geometry,
            outcome.zone.pageId,
            scenario.instanceState.generation.startingZoneIds
          )
          expect(
            inHalfPlane(
              {
                x: mintedRect.x + mintedRect.w / 2,
                y: mintedRect.y + mintedRect.h / 2,
              },
              halfPlane
            )
          ).toBe(true)
        }
        for (const child of outcome.stubs) {
          expect(child.zoneId).toBe(outcome.zone.id)
          expect(child.anchor).toStrictEqual(
            // Minted zones carry no size — children anchor on the M footprint.
            anchorOnDefaultFootprint(child.bearing)
          )
        }
      })
    )
  })
})

// The real primitive, not a copy — the law asserts the roller used the real
// child-anchor derivation on the M default footprint.
const anchorOnDefaultFootprint = (bearing: number) =>
  anchorFromBearing(footprintOf(undefined), bearing)

describe("rollExpansion laws — cursors and the escape hatch", () => {
  it("folded cursors are monotonically ≥ the ledger's at every purpose", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const result = roll(scenario)
        if (!result.ok) return
        const folded = fold(
          scenario.instanceState,
          scenario.ledger,
          result.value
        ).ledger
        for (const [purpose, cursor] of Object.entries(
          scenario.ledger.streamCursors
        )) {
          expect(folded.streamCursors[purpose] ?? 0).toBeGreaterThanOrEqual(
            cursor
          )
        }
      })
    )
  })

  it("expand → retract restores the stub byte-identical and never rewinds cursors; the re-expand consumes fresh positions", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const first = roll(scenario, "first")
        if (!first.ok) return
        const outcome = first.value.instanceEvents[0]!
        if (outcome.kind !== "mintZone") return

        const minted = fold(
          scenario.instanceState,
          scenario.ledger,
          first.value
        )
        const retraction = buildRetraction({
          instanceState: minted.instanceState,
          ledger: minted.ledger,
          zoneId: outcome.zone.id,
        })
        if (!retraction.ok) return
        const restored = fold(
          minted.instanceState,
          minted.ledger,
          retraction.value
        )

        // Byte-identical restoration (D10) — the whole instance state equals
        // the pre-mint state; only the ledger's cursors moved.
        expect(restored.instanceState).toStrictEqual(scenario.instanceState)
        expect(restored.ledger.mints).toStrictEqual(scenario.ledger.mints)
        expect(restored.ledger.mintedUniqueKeys).toStrictEqual(
          scenario.ledger.mintedUniqueKeys
        )
        for (const [purpose, count] of Object.entries(
          consumedOf(first.value)
        )) {
          expect(restored.ledger.streamCursors[purpose]).toBe(
            (scenario.ledger.streamCursors[purpose] ?? 0) + count
          )
        }

        // The re-expand equals a fresh roll at the *advanced* cursors — the
        // deterministic statement of "rolls a different result".
        const reExpand = rollExpansion({
          set: scenario.set,
          instanceState: restored.instanceState,
          ledger: restored.ledger,
          stubId: scenario.stubId,
          newId: counterIds("first"),
        })
        expect(reExpand).toStrictEqual(
          rollExpansion({
            set: scenario.set,
            instanceState: scenario.instanceState,
            ledger: restored.ledger,
            stubId: scenario.stubId,
            newId: counterIds("first"),
          })
        )
      })
    )
  })

  it("NEGATIVE CONTROL — rewinding the cursors reproduces the first outcome exactly", () => {
    // If any state other than ledger.streamCursors fed the streams, this would
    // fail — the differ-law's teeth live entirely in the never-rewind rule.
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const first = roll(scenario, "first")
        if (!first.ok) return
        const outcome = first.value.instanceEvents[0]!
        if (outcome.kind !== "mintZone") return

        const minted = fold(
          scenario.instanceState,
          scenario.ledger,
          first.value
        )
        const retraction = buildRetraction({
          instanceState: minted.instanceState,
          ledger: minted.ledger,
          zoneId: outcome.zone.id,
        })
        if (!retraction.ok) return
        const restored = fold(
          minted.instanceState,
          minted.ledger,
          retraction.value
        )

        const rewound: GenerationLedger = {
          ...restored.ledger,
          streamCursors: scenario.ledger.streamCursors,
        }
        const replay = rollExpansion({
          set: scenario.set,
          instanceState: restored.instanceState,
          ledger: rewound,
          stubId: scenario.stubId,
          newId: counterIds("first"),
        })
        expect(replay).toStrictEqual(first)
      })
    )
  })
})

describe("rollExpansion laws — non-LIFO retract over sibling mints", () => {
  /** Expands every initial stub in the scenario sequentially, then reverts an
   *  arbitrary shuffled subset of the successful mints. Ledger must equal the
   *  surviving mints; every restored stub must be byte-identical. */
  const arbitrarySiblingCase = arbitraryExpansionScenario.chain((scenario) => {
    const seedOrder = Object.keys(
      scenario.instanceState.generation.stubs
    ).sort()
    return fc
      .shuffledSubarray(seedOrder)
      .map((retractTargets) => ({ scenario, seedOrder, retractTargets }))
  })

  it("reverting any subset of sibling mints leaves exactly the survivors; cursors never decrease", () => {
    fc.assert(
      fc.property(
        arbitrarySiblingCase,
        ({ scenario, seedOrder, retractTargets }) => {
          // Expand every initial stub in id order.
          let world = {
            instanceState: scenario.instanceState,
            ledger: scenario.ledger,
          }
          const mintedBy = new Map<
            string,
            { zoneId: string; preMintStub: unknown }
          >()
          let counter = 0
          for (const stubId of seedOrder) {
            const stub = world.instanceState.generation.stubs[stubId]
            if (stub === undefined) continue // consumed by an earlier closure
            const result = rollExpansion({
              set: scenario.set,
              instanceState: world.instanceState,
              ledger: world.ledger,
              stubId,
              newId: counterIds(`sib-${counter++}`),
            })
            expect(result.ok).toBe(true)
            if (!result.ok) continue
            const outcome = result.value.instanceEvents[0]!
            if (outcome.kind === "mintZone") {
              mintedBy.set(stubId, {
                zoneId: outcome.zone.id,
                preMintStub: structuredClone(stub),
              })
            }
            world = fold(world.instanceState, world.ledger, result.value)
          }

          const cursorsAfterMints = { ...world.ledger.streamCursors }
          const revertedZoneIds = new Set<string>()
          for (const stubId of retractTargets) {
            const minted = mintedBy.get(stubId)
            if (minted === undefined) continue
            const retraction = buildRetraction({
              instanceState: world.instanceState,
              ledger: world.ledger,
              zoneId: minted.zoneId,
            })
            // A sibling mint can be non-leaf (a later sibling's closure landed on
            // it) — a refusal is legal; the law quantifies over what reverts.
            if (!retraction.ok) continue
            world = fold(world.instanceState, world.ledger, retraction.value)
            revertedZoneIds.add(minted.zoneId)
            // Byte-identical restoration, mid-sequence.
            expect(world.instanceState.generation.stubs[stubId]).toStrictEqual(
              minted.preMintStub
            )
            // Cursors untouched by every revert.
            expect(world.ledger.streamCursors).toStrictEqual(cursorsAfterMints)
          }

          // The ledger holds exactly the surviving mints.
          const survivingZoneIds = [...mintedBy.values()]
            .map((m) => m.zoneId)
            .filter((zoneId) => !revertedZoneIds.has(zoneId))
          expect(Object.keys(world.ledger.mints).sort()).toStrictEqual(
            survivingZoneIds.sort()
          )
        }
      )
    )
  })
})

describe("rollExpansion laws — benign replay (the D8 retry contract's engine half)", () => {
  it("re-reducing the returned instance events over the post-fold state is a same-ref no-op", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, (scenario) => {
        const result = roll(scenario)
        if (!result.ok) return
        const folded = fold(
          scenario.instanceState,
          scenario.ledger,
          result.value
        )
        for (const event of result.value.instanceEvents) {
          expect(reduceInstance(folded.instanceState, event)).toBe(
            folded.instanceState
          )
        }
      })
    )
  })
})

describe("arbitrary fixed points (meta-laws)", () => {
  it("every scenario instance state is a load-schema fixed point", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, ({ instanceState }) => {
        expect(mapInstanceStateSchema.parse(instanceState)).toStrictEqual(
          instanceState
        )
      })
    )
  })

  it("every scenario ledger is a load-schema fixed point", () => {
    fc.assert(
      fc.property(arbitraryExpansionScenario, ({ ledger }) => {
        expect(generationLedgerSchema.parse(ledger)).toStrictEqual(ledger)
      })
    )
  })

  it("every template set is a load-schema fixed point", () => {
    fc.assert(
      fc.property(arbitraryTemplateSet, (set) => {
        expect(templateSetContentSchema.parse(set)).toStrictEqual(set)
      })
    )
  })
})
