import { z } from "zod/v4"

import {
  ENCHANTMENT_TYPES,
  type EnchantmentType,
} from "@workspace/game/foundation/combat/enchantment"
import type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"
import type { Equals } from "@workspace/game/foundation/equals"
import {
  mapGeometryEventSchema,
  type MapGeometryEvent,
} from "@workspace/game/foundation/map/geometry-event"

/**
 * The spatial event vocabulary {@link import("@workspace/game/engine") reduceMapInstance}
 * dispatches over — the events that mutate spatial state once it lives on the
 * {@link import("./map-instance").MapInstanceState}: the zone graph, token
 * occupancy, engagement, and the Zone Enchantment.
 *
 * **Canonical home (UNN-459 cutover):** these four families were carved out of
 * `session-event.ts`'s {@link CombatEvent} union when the spatial state moved off
 * the `CombatSession` onto the Map Instance. The session reducer keeps the
 * non-spatial events; the Instance reducer owns these. A combined boundary that
 * still needs both — the Server Action parsing an untrusted client payload —
 * unions {@link combatEventSchema} with {@link mapInstanceEventSchema} and routes
 * on {@link isMapInstanceEvent}.
 *
 * Reveal/hide/unlock (the fog overlay) arrive here in M2 (UNN-464) alongside the
 * reveal-state on {@link import("./map-instance").MapInstanceState}.
 */

/**
 * Zone-graph events (UNN-313) — mutate the Map Instance geometry (its `zones` +
 * id-keyed `connections`; see {@link import("../map/geometry").MapGeometry}),
 * never a combatant. M2 (UNN-464) converged the Instance geometry onto the rich
 * template shape, so these events now write {@link import("../map/geometry").MapZone}s
 * (the reducer defaults `position`/`description` for the ad-hoc combat-setup
 * surface that authors only name/notes) and {@link import("../map/geometry").MapConnection}s:
 *
 * - `addZone` records a new Zone. The client may supply the stable `zoneId` (the
 *   encounter-setup surface mints it so the optimistic id matches the persisted
 *   one and a follow-up adjacency/placement edit can reference it before any
 *   refresh — UNN-347); when omitted the reducer mints it via its injectable
 *   `newId`. The client supplies the display `name` and optional `notes` (stored
 *   as the Zone's `dmNotes`); `position`/`description` default.
 * - `removeZone` drops a zone, prunes every connection touching it, and clears
 *   the Enchantment when it sat on the removed zone. It does **not** touch
 *   occupancy — token cleanup is a separate concern.
 * - `setZoneAdjacency` records (or clears) an **undirected** connection between
 *   two zones; idempotent — re-adding an existing edge does not duplicate it (the
 *   reducer mints a connection id + default `hidden`/`locked` flags on add).
 * - `renameZone` updates a zone's display name.
 *
 * Each is a no-op when a referenced zone id is unknown.
 */
export type ZoneGraphEvent =
  | { kind: "addZone"; name: string; notes?: string; zoneId?: string }
  | { kind: "removeZone"; zoneId: string }
  | {
      kind: "setZoneAdjacency"
      zoneIdA: string
      zoneIdB: string
      adjacent: boolean
    }
  | { kind: "renameZone"; zoneId: string; name: string }

/**
 * `moveCombatant` travels a token to `toZoneId` (UNN-315) — the in-play placement
 * edit, also reused to place an unplaced mid-combat joiner. The reducer sets the
 * token's `zoneId` verbatim and never validates that `toZoneId` exists (no
 * referential enforcement — UNN-313 decision; the DM control offers only adjacent
 * zones). Per ADR Decision 8 it **guides, doesn't block**: a non-adjacent target
 * is still applied. Moving to the occupied zone, or an unknown combatant id, is a
 * no-op. Leaving a zone severs the token's same-zone engagements on both sides.
 */
export type MoveCombatantEvent = {
  kind: "moveCombatant"
  combatantId: string
  toZoneId: string
}

/**
 * Engagement events (UNN-316) — the *who* a token is melee-locked with, on the
 * Map Instance occupancy (position is the orthogonal `zoneId` on the same token):
 *
 * - `setEngagement` replaces the token's engagement with
 *   `{ status: "engaged", targetCombatantIds }` (≥1 target).
 * - `clearEngagement` sets it back to `{ status: "free" }`.
 *
 * Engagement is **symmetric**: the reducer mirrors every change onto the targets
 * (A engaged with B ⟺ B engaged with A). Target ids are **not** validated at
 * reduce-time (same philosophy as `toZoneId` — UNN-313/315); the DM control
 * offers only same-zone combatants. An unknown combatant id, or clearing an
 * already-Free token, is a no-op.
 */
export type EngagementEvent =
  | {
      kind: "setEngagement"
      combatantId: string
      targetCombatantIds: string[]
    }
  | { kind: "clearEngagement"; combatantId: string }

/**
 * Zone-Enchantment events — the Bard mechanic's battlefield state, a singleton on
 * the Map Instance (`enchantment`; see
 * {@link import("../combat/enchantment").zoneEnchantmentSchema}):
 *
 * - `applyEnchantment` Enchants `zoneId` with `enchantment`: re-applying the
 *   same type to the already-Enchanted Zone raises its Forte (capped at
 *   `MAX_FORTE`); anything else — a different Zone or a different type — replaces
 *   the singleton at Forte 1 (rulebook: "if you Enchant a second Zone, the first
 *   one loses its Enchantment"). No-op when `zoneId` isn't a current zone.
 * - `clearEnchantment` removes it outright (DM correction; combat's end).
 *
 * **DM-only**: deliberately not in
 * {@link import("./session-event").PLAYER_OVERLAY_EVENT_KINDS} — those are gated
 * per owned combatant, and an Enchantment is Instance-level state.
 */
export type EnchantmentEvent =
  | { kind: "applyEnchantment"; zoneId: string; enchantment: EnchantmentType }
  | { kind: "clearEnchantment" }

/**
 * Reveal events (UNN-464) — mutate the runtime fog overlay on the Map Instance
 * (`reveal`; see {@link import("./map-instance").RevealState}), never the
 * snapshotted `hidden`/`locked` flags themselves (those are immutable authored
 * geography — reveal/unlock are overlays *on top of* them):
 *
 * - `revealZone` / `hideZone` add/remove a Zone from `revealedZoneIds` (the DM's
 *   manual override; the `move → reveal` rule reveals on entry automatically).
 * - `revealConnection` / `hideConnection` add/remove a **hidden** connection from
 *   `revealedConnectionIds` (surface a secret passage, or re-conceal it).
 * - `unlockConnection` / `lockConnection` add/remove a **locked** connection from
 *   `unlockedConnectionIds` (open a barred door, or re-bar it — DM correction).
 *
 * Each is idempotent (re-revealing a revealed Zone is a no-op) and a no-op on an
 * unknown Zone/connection id. Revealing/unlocking is player-visible and socially
 * irreversible, so the DM control confirms before dispatching (PRD FR-5).
 */
export type RevealEvent =
  | { kind: "revealZone"; zoneId: string }
  | { kind: "hideZone"; zoneId: string }
  | { kind: "revealConnection"; connectionId: string }
  | { kind: "hideConnection"; connectionId: string }
  | { kind: "unlockConnection"; connectionId: string }
  | { kind: "lockConnection"; connectionId: string }

/**
 * In-console geometry edit (UNN-486) — the wrapper that lets the live Map Instance
 * reuse the Map-**template**'s geometry-edit vocabulary
 * ({@link MapGeometryEvent}). The reducer delegates the inner `event` to
 * {@link import("@workspace/game/engine") reduceMapGeometry} over `state.geometry`,
 * then reconciles the Instance-only overlays (`reveal`, `enchantment`) against the
 * new geometry — e.g. a `deleteZone` drops the zone's fog entries and clears an
 * Enchantment that sat on it.
 *
 * The DM's Edit-mode canvas dispatches these (add/move/rename/retext zones,
 * draw/flag/delete connections); the legacy {@link ZoneGraphEvent} combat-setup
 * protocol is deliberately kept separate (reworking that wire protocol is its own
 * concern). Deleting a Zone that an occupancy token stands in is **blocked** (a
 * no-op) — the DM relocates the party first.
 */
export type EditGeometryEvent = {
  kind: "editGeometry"
  event: MapGeometryEvent
}

/**
 * One spatial event applied to a {@link import("./map-instance").MapInstanceState}.
 * The discriminated union {@link import("@workspace/game/engine") reduceMapInstance}
 * dispatches over; its `kind`s stay in lockstep with that reducer's exhaustive
 * `switch` and with {@link mapInstanceEventSchema}.
 */
export type MapInstanceEvent =
  | ZoneGraphEvent
  | MoveCombatantEvent
  | EngagementEvent
  | EnchantmentEvent
  | RevealEvent
  | EditGeometryEvent

/**
 * Runtime validator for a {@link MapInstanceEvent} arriving over the wire — the
 * spatial half of the boundary the impure shell (`applyCombatEvent`) parses an
 * untrusted client payload through before handing it to `reduceMapInstance`.
 * Mirrors the hand-written {@link MapInstanceEvent} union member-for-member; the
 * lockstep assertion below stops the two from drifting.
 */
export const mapInstanceEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addZone"),
    name: z.string().min(1),
    notes: z.string().optional(),
    zoneId: z.string().optional(),
  }),
  z.object({ kind: z.literal("removeZone"), zoneId: z.string() }),
  z.object({
    kind: z.literal("setZoneAdjacency"),
    zoneIdA: z.string(),
    zoneIdB: z.string(),
    adjacent: z.boolean(),
  }),
  z.object({
    kind: z.literal("renameZone"),
    zoneId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("moveCombatant"),
    combatantId: z.string(),
    toZoneId: z.string(),
  }),
  z.object({
    kind: z.literal("setEngagement"),
    combatantId: z.string(),
    targetCombatantIds: z.array(z.string()).min(1),
  }),
  z.object({ kind: z.literal("clearEngagement"), combatantId: z.string() }),
  z.object({
    kind: z.literal("applyEnchantment"),
    zoneId: z.string(),
    enchantment: z.enum(ENCHANTMENT_TYPES),
  }),
  z.object({ kind: z.literal("clearEnchantment") }),
  z.object({ kind: z.literal("revealZone"), zoneId: z.string() }),
  z.object({ kind: z.literal("hideZone"), zoneId: z.string() }),
  z.object({
    kind: z.literal("revealConnection"),
    connectionId: z.string(),
  }),
  z.object({ kind: z.literal("hideConnection"), connectionId: z.string() }),
  z.object({
    kind: z.literal("unlockConnection"),
    connectionId: z.string(),
  }),
  z.object({ kind: z.literal("lockConnection"), connectionId: z.string() }),
  z.object({
    kind: z.literal("editGeometry"),
    event: mapGeometryEventSchema,
  }),
])

/**
 * Compile-time lockstep guard: if {@link mapInstanceEventSchema} and the
 * hand-written {@link MapInstanceEvent} union ever diverge, this assignment stops
 * compiling.
 */
const _mapInstanceEventSchemaInSync: Equals<
  z.infer<typeof mapInstanceEventSchema>,
  MapInstanceEvent
> = true
void _mapInstanceEventSchemaInSync

/**
 * The discriminant `kind`s of every {@link MapInstanceEvent} — the runtime side
 * of {@link isMapInstanceEvent}. The assertion below proves it covers the union
 * exactly (no kind added or dropped without updating this list).
 */
export const MAP_INSTANCE_EVENT_KINDS = [
  "addZone",
  "removeZone",
  "setZoneAdjacency",
  "renameZone",
  "moveCombatant",
  "setEngagement",
  "clearEngagement",
  "applyEnchantment",
  "clearEnchantment",
  "revealZone",
  "hideZone",
  "revealConnection",
  "hideConnection",
  "unlockConnection",
  "lockConnection",
  "editGeometry",
] as const

const _mapInstanceEventKindsInSync: Equals<
  (typeof MAP_INSTANCE_EVENT_KINDS)[number],
  MapInstanceEvent["kind"]
> = true
void _mapInstanceEventKindsInSync

/**
 * Splits the combined `applyCombatEvent` payload into its two reducer paths:
 * narrows a {@link CombatEvent} (session) vs. {@link MapInstanceEvent} (spatial)
 * so the Server Action routes a parsed event to the right reducer + row.
 */
export function isMapInstanceEvent(
  event: CombatEvent | MapInstanceEvent
): event is MapInstanceEvent {
  return (MAP_INSTANCE_EVENT_KINDS as readonly string[]).includes(event.kind)
}
