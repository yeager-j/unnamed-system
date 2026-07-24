import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import {
  arbitraryExpeditionInstance,
  arbitraryMapGeometry,
  arbitraryStaticReveal,
  SEED_MAP_ID,
} from "@workspace/game-v2/__fixtures__/arbitraries/spatial"
import {
  applyStaticReveal,
  foldExpedition,
  type RegionKnowledge,
  type StaticReveal,
} from "@workspace/game-v2/generation/fold"
import { withAuthoredProvenance } from "@workspace/game-v2/generation/provenance"
import { mapInstanceFromGeometry } from "@workspace/game-v2/spatial/instance-factory"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"

/**
 * **The escrow round-trips** (UNN-589). The fold's central claim — knowledge of an
 * authored place survives an expedition boundary — is universally quantified over
 * every small geometry, provenance mix, and reveal subset. Example tests check the
 * cases someone drew; these range over the generator's whole space, so a fold that
 * leaks manual space, drops a prior chart, or throws on a stale id is found rather
 * than remembered.
 */

type FoldImpl = typeof foldExpedition
const SITE_TEMPLATE_KEYS = ["hall", "shrine", "vault"] as const
const emptyKnowledge = (): RegionKnowledge => ({
  discoveredSiteKeys: [],
  staticReveal: {},
})

/**
 * **Absence** — the provenance gate holds: with an empty prior (so every output id
 * comes from *this* fold), every folded zone is authored-stamped, and every folded
 * connection has two authored-stamped endpoints. Restated independently of the fold's
 * mechanics so the negative control below can aim it at a gate-skipping fold.
 */
function foldOutputRespectsProvenance(fold: FoldImpl) {
  return fc.property(arbitraryExpeditionInstance, (instance) => {
    const output = fold({
      instance,
      seedMapId: SEED_MAP_ID,
      siteTemplateKeys: SITE_TEMPLATE_KEYS,
      prior: emptyKnowledge(),
    })
    for (const entry of Object.values(output.staticReveal)) {
      for (const zoneId of entry.zoneIds) {
        expect(instance.generation.zones[zoneId]?.source).toBe("authored")
      }
      for (const connectionId of entry.connectionIds) {
        const connection = instance.geometry.connections[connectionId]
        expect(connection).toBeDefined()
        expect(instance.generation.zones[connection!.fromZoneId]?.source).toBe(
          "authored"
        )
        expect(instance.generation.zones[connection!.toZoneId]?.source).toBe(
          "authored"
        )
      }
    }
  })
}

const arbitraryPrior: fc.Arbitrary<StaticReveal> = record({
  [SEED_MAP_ID]: record({
    zoneIds: fc.array(fc.string(), { maxLength: 5 }),
    connectionIds: fc.array(fc.string(), { maxLength: 5 }),
  }),
  "history-map": record({
    zoneIds: fc.array(fc.string(), { maxLength: 5 }),
    connectionIds: fc.array(fc.string(), { maxLength: 5 }),
  }),
})
const arbitraryPriorKnowledge: fc.Arbitrary<RegionKnowledge> = record({
  discoveredSiteKeys: fc.array(fc.string(), { maxLength: 5 }),
  staticReveal: arbitraryPrior,
})

describe("foldExpedition / applyStaticReveal laws", () => {
  it("round-trip: an all-authored expedition's revealed geography re-reveals on a fresh snapshot", () => {
    fc.assert(
      fc.property(
        arbitraryMapGeometry.chain((geometry) =>
          record({
            geometry: fc.constant(geometry),
            revealedZoneIds: fc.subarray(Object.keys(geometry.zones)),
            revealedConnectionIds: fc.subarray(
              Object.keys(geometry.connections)
            ),
          })
        ),
        ({ geometry, revealedZoneIds, revealedConnectionIds }) => {
          // Simulate expedition start: stamp the fresh snapshot all-authored.
          const started = withAuthoredProvenance(
            mapInstanceFromGeometry(geometry)
          )
          const explored: MapInstanceState = {
            ...started,
            reveal: {
              revealedZoneIds,
              revealedConnectionIds,
              unlockedConnectionIds: [],
            },
          }

          const fold = foldExpedition({
            instance: explored,
            seedMapId: SEED_MAP_ID,
            siteTemplateKeys: SITE_TEMPLATE_KEYS,
            prior: emptyKnowledge(),
          })
          const applied = applyStaticReveal(
            mapInstanceFromGeometry(geometry),
            SEED_MAP_ID,
            fold.staticReveal
          )

          for (const id of revealedZoneIds) {
            expect(applied.reveal.revealedZoneIds).toContain(id)
          }
          for (const id of revealedConnectionIds) {
            expect(applied.reveal.revealedConnectionIds).toContain(id)
          }
        }
      )
    )
  })

  it("absence: the fold output never carries a non-authored id", () => {
    fc.assert(foldOutputRespectsProvenance(foldExpedition))
  })

  it("site discovery: every newly folded key came from a revealed authored or generated site", () => {
    fc.assert(
      fc.property(arbitraryExpeditionInstance, (instance) => {
        const output = foldExpedition({
          instance,
          seedMapId: SEED_MAP_ID,
          siteTemplateKeys: SITE_TEMPLATE_KEYS,
          prior: emptyKnowledge(),
        })

        for (const templateKey of output.discoveredSiteKeys) {
          expect(SITE_TEMPLATE_KEYS).toContain(templateKey)
          const source = instance.reveal.revealedZoneIds
            .map((zoneId) => ({
              zone: instance.geometry.zones[zoneId],
              provenance: instance.generation.zones[zoneId],
            }))
            .find(({ zone, provenance }) => {
              if (
                zone === undefined ||
                provenance === undefined ||
                provenance.source === "manual"
              ) {
                return false
              }
              const provenanceKey =
                provenance.templateKey ??
                (provenance.source === "authored"
                  ? zone.templateKey
                  : undefined)
              return provenanceKey === templateKey
            })
          expect(source).toBeDefined()
        }
      })
    )
  })

  it("stale filter: applyStaticReveal never throws, and reveal ⊆ geometry ids ∪ prior reveal", () => {
    fc.assert(
      fc.property(
        arbitraryMapGeometry.chain((geometry) =>
          record({
            geometry: fc.constant(geometry),
            staticReveal: arbitraryStaticReveal(geometry),
            preRevealedZones: fc.subarray([
              ...Object.keys(geometry.zones),
              "pre-junk-zone",
            ]),
            preRevealedConnections: fc.subarray([
              ...Object.keys(geometry.connections),
              "pre-junk-conn",
            ]),
          })
        ),
        ({
          geometry,
          staticReveal,
          preRevealedZones,
          preRevealedConnections,
        }) => {
          const base: MapInstanceState = {
            ...mapInstanceFromGeometry(geometry),
            reveal: {
              revealedZoneIds: preRevealedZones,
              revealedConnectionIds: preRevealedConnections,
              unlockedConnectionIds: [],
            },
          }

          const applied = applyStaticReveal(base, SEED_MAP_ID, staticReveal)

          const geometryZoneIds = new Set(Object.keys(geometry.zones))
          const priorZones = new Set(base.reveal.revealedZoneIds)
          for (const id of applied.reveal.revealedZoneIds) {
            expect(geometryZoneIds.has(id) || priorZones.has(id)).toBe(true)
          }

          const geometryConnectionIds = new Set(
            Object.keys(geometry.connections)
          )
          const priorConnections = new Set(base.reveal.revealedConnectionIds)
          for (const id of applied.reveal.revealedConnectionIds) {
            expect(
              geometryConnectionIds.has(id) || priorConnections.has(id)
            ).toBe(true)
          }
        }
      )
    )
  })

  it("monotonicity: the fold output contains every prior id, per source Map", () => {
    fc.assert(
      fc.property(
        arbitraryExpeditionInstance,
        arbitraryPriorKnowledge,
        (instance, prior) => {
          const output = foldExpedition({
            instance,
            seedMapId: SEED_MAP_ID,
            siteTemplateKeys: SITE_TEMPLATE_KEYS,
            prior,
          })
          for (const key of prior.discoveredSiteKeys) {
            expect(output.discoveredSiteKeys).toContain(key)
          }
          for (const [source, entry] of Object.entries(prior.staticReveal)) {
            const outputEntry = output.staticReveal[source]
            expect(outputEntry).toBeDefined()
            for (const id of entry.zoneIds) {
              expect(outputEntry!.zoneIds).toContain(id)
            }
            for (const id of entry.connectionIds) {
              expect(outputEntry!.connectionIds).toContain(id)
            }
          }
        }
      )
    )
  })
})

describe("negative control — the absence law can go red", () => {
  /**
   * A fold that **skips the provenance gate**: it charts every revealed zone and
   * every revealed connection whose endpoints exist, regardless of source. This is
   * the exact leak `foldOutputRespectsProvenance` exists to catch — a manual or
   * generated room bleeding into the Region's permanent chart.
   */
  const gateSkippingFold: FoldImpl = ({ instance, seedMapId, prior }) => {
    const zoneIds = instance.reveal.revealedZoneIds.filter(
      (id) => instance.geometry.zones[id] !== undefined
    )
    const connectionIds = instance.reveal.revealedConnectionIds.filter(
      (id) => instance.geometry.connections[id] !== undefined
    )
    return {
      discoveredSiteKeys: prior.discoveredSiteKeys,
      staticReveal: { [seedMapId]: { zoneIds, connectionIds } },
    }
  }

  it("fails for a fold that ignores provenance", () => {
    const result = fc.check(foldOutputRespectsProvenance(gateSkippingFold))
    expect(result.failed).toBe(true)
  })
})
