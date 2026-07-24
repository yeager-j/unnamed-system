import { z } from "zod/v4"

import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import { pageOfZone } from "@workspace/game-v2/spatial/pages"

/**
 * The **`staticReveal` escrow** (ADR-0001; procedural-dungeons tech design D5).
 *
 * `staticReveal` is a *chart in escrow* — the party's mapped knowledge of every
 * stable source Map, homed on the Region only because the Place model that would own
 * it is deferred. **This module is `staticReveal`'s only touchpoint.** Three call
 * sites route through it, and no other code reads or writes the shape:
 *
 * - `foldExpedition` — the **write** at expedition finish: authored, revealed
 *   geography folds into the escrow, unioned with what prior expeditions charted.
 * - `applyStaticReveal` — the **apply** at expedition start (over the seed Map's
 *   fresh snapshot) and (P6) at portal graft (over a grafted static Map): the
 *   escrowed reveal re-materializes onto the new Instance.
 *
 * Retiring the escrow under the Place model is then a single move: seed the Place's
 * chart from `staticReveal` and delete this module. Keeping every touch here is what
 * makes that retirement local (ADR-0001, *escrow contracts*).
 */

/** One source Map's charted geography — the revealed authored Zone and connection
 *  ids folded for that Map. Both `.default()` empty so an old Region blob heals on
 *  read (the graceful-boundary rule every jsonb shape follows). */
export const staticRevealEntrySchema = z.object({
  zoneIds: z.array(z.string()).default([]),
  connectionIds: z.array(z.string()).default([]),
})

/** The Region's `staticReveal` fold: charted geography keyed by **source mapId**
 *  (the seed Map and every grafted static Map, uniformly). Attribution is derived at
 *  fold time from `generation.grafts`, never stored on the ids themselves. */
export const staticRevealSchema = z.record(z.string(), staticRevealEntrySchema)
export type StaticReveal = z.infer<typeof staticRevealSchema>

/** The Region's monotonic memory of site templates the party has revealed.
 *  Stale keys remain valid knowledge; checklist derivation simply ignores keys
 *  that no longer have a live site row. */
export const discoveredSiteKeysSchema = z.array(z.string()).default([])
export type DiscoveredSiteKeys = z.infer<typeof discoveredSiteKeysSchema>

/** Both Region-sized knowledge folds committed together when an expedition
 *  finishes. They are separate database columns, but one domain decision. */
export interface RegionKnowledge {
  discoveredSiteKeys: DiscoveredSiteKeys
  staticReveal: StaticReveal
}

/** A total, environment-independent code-unit order for the *appended* portion of a
 *  union — the same comparator `spatial/pages.ts` pins for snapshot determinism, and
 *  for the same reason: `localeCompare` varies by environment and can collapse
 *  distinct strings to `0`. Prior order is preserved; new ids sort by this. */
const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/**
 * Unions `additions` into `prior`, **monotonically and deterministically**: every
 * id already in `prior` keeps its position (de-duplicated), then the ids not already
 * present are appended sorted by {@link byCodeUnit}. Sorting only the appended tail
 * keeps the result independent of `Object.keys` / reveal-array iteration order, so
 * two folds of the same knowledge over differently-ordered geometry agree.
 */
function unionSorted(
  prior: readonly string[],
  additions: Set<string>
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of prior) {
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  const fresh = [...additions].filter((id) => !seen.has(id)).sort(byCodeUnit)
  return [...result, ...fresh]
}

/**
 * Folds an expedition's revealed knowledge into the Region, unioned with
 * `prior` (procedural-dungeons tech design D5). Called once by
 * `finishExpeditionAction`; the result replaces both Region knowledge columns.
 *
 * What folds into `staticReveal`:
 *
 * - A **Zone** folds iff it is authored-stamped **and** revealed. Generated, manual,
 *   and provenance-missing Zones never fold — visit-scoped space dies with the run,
 *   and a missing stamp fails safe (an under-fold, never a leak into the chart).
 * - A **connection** folds iff it is revealed **and both** endpoint Zones are
 *   authored-stamped. `unlockedConnectionIds` **never** fold: unlock is *world state*
 *   (the reshuffle re-locks every door), whereas reveal is *knowledge* — the two are
 *   different lifetimes, and only knowledge is charted.
 *
 * Attribution — which source Map a folded id charts to — is derived, never stored: a
 * Zone attributes to the Map its **page** came from (`generation.grafts` claims
 * grafted pages by source mapId; every unclaimed page is a seed page and attributes
 * to `seedMapId`). A connection attributes by its **`fromZoneId`'s** page — an
 * arbitrary-but-deterministic pick for the (rare, P6) cross-page connection spanning
 * a seed page and a grafted page; both endpoints are authored, so either side is a
 * legitimate chart home and the `from` side is chosen once.
 *
 * The union is **per source Map**: sources the party touched this run gain their
 * new ids (monotonically — knowledge only grows); sources untouched this run pass
 * through from `prior` unchanged.
 *
 * `discoveredSiteKeys` is the second knowledge fold. A revealed Zone contributes
 * its template key iff the key names a live site and its provenance is authored or
 * generated. Manual and provenance-missing Zones are visit-scoped and never become
 * Region knowledge. Prior keys remain in their existing order; newly discovered
 * keys append in deterministic code-unit order.
 */
export function foldExpedition(input: {
  instance: MapInstanceState
  seedMapId: string
  siteTemplateKeys: readonly string[]
  prior: RegionKnowledge
}): RegionKnowledge {
  const { instance, seedMapId, prior } = input
  const { geometry, generation, reveal } = instance
  const siteTemplateKeys = new Set(input.siteTemplateKeys)

  const isAuthored = (zoneId: string): boolean =>
    generation.zones[zoneId]?.source === "authored"

  const discoveredSiteKeys = new Set<string>()
  for (const zoneId of reveal.revealedZoneIds) {
    const zone = geometry.zones[zoneId]
    const provenance = generation.zones[zoneId]
    if (
      zone?.templateKey === undefined ||
      provenance === undefined ||
      (provenance.source !== "authored" && provenance.source !== "generated") ||
      !siteTemplateKeys.has(zone.templateKey)
    ) {
      continue
    }
    discoveredSiteKeys.add(zone.templateKey)
  }

  // page id → source mapId. A grafted page attributes to the Map that grafted it;
  // every other (seed) page attributes to `seedMapId`.
  const pageToSource = new Map<string, string>()
  for (const [mapId, graft] of Object.entries(generation.grafts)) {
    for (const pageId of graft.pageIds) pageToSource.set(pageId, mapId)
  }
  const sourceOfZone = (zoneId: string): string => {
    const pageId = pageOfZone(geometry, zoneId)
    if (pageId === undefined) return seedMapId
    return pageToSource.get(pageId) ?? seedMapId
  }

  const foldedZones = new Map<string, Set<string>>()
  const foldedConnections = new Map<string, Set<string>>()
  const collect = (
    into: Map<string, Set<string>>,
    source: string,
    id: string
  ): void => {
    const set = into.get(source) ?? new Set<string>()
    set.add(id)
    into.set(source, set)
  }

  for (const zoneId of reveal.revealedZoneIds) {
    if (!isAuthored(zoneId)) continue
    // Defensive: a revealed id whose Zone the geometry no longer carries has no
    // page to attribute to. Authored+present is the real fold set.
    if (geometry.zones[zoneId] === undefined) continue
    collect(foldedZones, sourceOfZone(zoneId), zoneId)
  }

  for (const connectionId of reveal.revealedConnectionIds) {
    const connection = geometry.connections[connectionId]
    if (connection === undefined) continue
    if (
      !isAuthored(connection.fromZoneId) ||
      !isAuthored(connection.toZoneId)
    ) {
      continue
    }
    collect(
      foldedConnections,
      sourceOfZone(connection.fromZoneId),
      connectionId
    )
  }

  const result: StaticReveal = {}
  const sources = new Set<string>([
    ...Object.keys(prior.staticReveal),
    ...foldedZones.keys(),
    ...foldedConnections.keys(),
  ])
  const empty = new Set<string>()
  for (const source of sources) {
    const priorEntry = prior.staticReveal[source] ?? {
      zoneIds: [],
      connectionIds: [],
    }
    result[source] = {
      zoneIds: unionSorted(
        priorEntry.zoneIds,
        foldedZones.get(source) ?? empty
      ),
      connectionIds: unionSorted(
        priorEntry.connectionIds,
        foldedConnections.get(source) ?? empty
      ),
    }
  }
  return {
    discoveredSiteKeys: unionSorted(
      prior.discoveredSiteKeys,
      discoveredSiteKeys
    ),
    staticReveal: result,
  }
}

/**
 * Re-applies a source Map's escrowed chart onto `state`'s reveal overlay
 * (procedural-dungeons tech design D5) — the seed-Map apply at expedition start and
 * (P6) the static-Map apply at graft. It **unions, never replaces**: escrowed
 * knowledge is added to whatever the fresh snapshot already reveals, and no id is
 * ever removed.
 *
 * - A `staticReveal` with no entry for `sourceMapId` returns `state` **unchanged**
 *   (same reference) — nothing was charted for this Map.
 * - Escrowed ids the author has since deleted from the Map filter out silently (they
 *   are absent from `state.geometry`) — the same graceful-boundary tolerance every
 *   blob crossing extends to stale ids.
 * - If every surviving id is already revealed, returns `state` unchanged (same
 *   reference); otherwise a fresh state with the new ids appended.
 */
export function applyStaticReveal(
  state: MapInstanceState,
  sourceMapId: string,
  staticReveal: StaticReveal
): MapInstanceState {
  const entry = staticReveal[sourceMapId]
  if (entry === undefined) return state

  const addZoneIds = dedupeMissing(
    entry.zoneIds,
    state.reveal.revealedZoneIds,
    (id) => state.geometry.zones[id] !== undefined
  )
  const addConnectionIds = dedupeMissing(
    entry.connectionIds,
    state.reveal.revealedConnectionIds,
    (id) => state.geometry.connections[id] !== undefined
  )

  if (addZoneIds.length === 0 && addConnectionIds.length === 0) return state

  return {
    ...state,
    reveal: {
      ...state.reveal,
      revealedZoneIds: [...state.reveal.revealedZoneIds, ...addZoneIds],
      revealedConnectionIds: [
        ...state.reveal.revealedConnectionIds,
        ...addConnectionIds,
      ],
    },
  }
}

/** The ids in `candidates` that `present` accepts (survive the stale filter) and
 *  that `existing` does not already contain — de-duplicated, preserving first-seen
 *  order. The exact set `applyStaticReveal` appends. */
function dedupeMissing(
  candidates: readonly string[],
  existing: readonly string[],
  present: (id: string) => boolean
): string[] {
  const seen = new Set<string>(existing)
  const result: string[] = []
  for (const id of candidates) {
    if (!present(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}
