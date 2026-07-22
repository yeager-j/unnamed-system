import { createHash } from "node:crypto"

import { axisId, type AxisId } from "@workspace/headcanon"

import type { VersionClass } from "./version-classes"

/**
 * Showtime's storage-owned revision-axis namespace (Headcanon P2a — UNN-673).
 *
 * A Headcanon axis is a globally stable address for one monotonic revision line
 * tied to a **storage fact's lifetime**, not to any view that observes it. The
 * `@workspace/headcanon` package owns the axis _algebra_ (`AxisId`, vectors,
 * coverage, cache-tag/channel derivation) but deliberately imposes no address
 * grammar; this module is the single home for the concrete address _scheme_, so
 * a character sheet, an encounter console, and a dungeon console all name the
 * same storage fact identically without per-view translation.
 *
 * Two rules keep the scheme stable:
 *
 * - **Opaque primary-ID addresses.** The canonical address is keyed by the
 *   row's primary `id`, then SHA-256 hashed before it crosses an RSC, cache, or
 *   invalidation boundary. Public and storage IDs never become capabilities.
 * - **One factory per storage axis.** The full namespace is declared here as the
 *   Single Choice for axis addressing (the versioned string is a deployed
 *   protocol — a stale tab may compare against a newer server), even though only
 *   the four `entity` axes have a consumer in P2a. Encounter, map-instance,
 *   dungeon, region, and the membership/container axes gain consumers when
 *   combat and dungeon bindings land (Phase 3).
 *
 * **Imported by loaders and handlers only** — a loader stamps the axes its canon
 * observes; a mutation handler records the axes its accepted transaction
 * advances. Nothing in the view tier addresses an axis directly.
 */

// The canonical addresses below are private hash inputs, but remain a deployed
// protocol: changing one strands stale canons from their invalidations.
function opaqueAxis(storageAddress: string): AxisId {
  const digest = createHash("sha256").update(storageAddress).digest("hex")
  return axisId(`showtime:axis:v1:${digest}`)
}

/** `entity/{id}/identity` — name, pronouns, portrait, notes, and identity-class
 *  component writes (Origin, talents, narrative). */
export const entityIdentityAxis = (entityId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:entity:${entityId}:identity`)

/** `entity/{id}/vitals` — in-play state: pools, resources, mechanics, rest,
 *  exhaustion (the DM-console-writable class). */
export const entityVitalsAxis = (entityId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:entity:${entityId}:vitals`)

/** `entity/{id}/inventory` — equipment and currency. */
export const entityInventoryAxis = (entityId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:entity:${entityId}:inventory`)

/** `entity/{id}/progression` — level, archetypes, virtues. */
export const entityProgressionAxis = (entityId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:entity:${entityId}:progression`)

/**
 * The four per-write-class entity axes, keyed by {@link VersionClass}. A Writer
 * declares its `durableClass`, so a handler stamps `entityAxisFor[class](id)`
 * and a loader observes all four from one `entity` row — the class→axis choice
 * made once here, decided nowhere downstream.
 */
export const entityAxisFor: Record<VersionClass, (entityId: string) => AxisId> =
  {
    identity: entityIdentityAxis,
    vitals: entityVitalsAxis,
    inventory: entityInventoryAxis,
    progression: entityProgressionAxis,
  }

/** `encounter/{id}` — one encounter session's version line. */
export const encounterAxis = (encounterId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:encounter:${encounterId}`)

/** `map-instance/{id}` — one live Map Instance's spatial version line. */
export const mapInstanceAxis = (instanceId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:map-instance:${instanceId}`)

/** `map-instance/{id}/encounter-membership` — the stable container axis a
 *  view observes to learn that the instance's live encounter appeared,
 *  disappeared, or changed (an absence dependency, per the loader contract). */
export const mapInstanceEncounterMembershipAxis = (
  instanceId: string
): AxisId =>
  opaqueAxis(
    `showtime:storage:v1:map-instance:${instanceId}:encounter-membership`
  )

/** `dungeon/{id}` — one dungeon's version line. */
export const dungeonAxis = (dungeonId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:dungeon:${dungeonId}`)

/** `dungeon/{id}/roster-membership` — the stable container axis for changes to
 *  which characters occupy the dungeon's roster slots. */
export const dungeonRosterMembershipAxis = (dungeonId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:dungeon:${dungeonId}:roster-membership`)

/** `region/{id}` — one region's version line. */
export const regionAxis = (regionId: string): AxisId =>
  opaqueAxis(`showtime:storage:v1:region:${regionId}`)
