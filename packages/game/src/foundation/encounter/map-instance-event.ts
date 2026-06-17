import { z } from "zod/v4"

import {
  ENCHANTMENT_TYPES,
  type EnchantmentType,
} from "@workspace/game/foundation/combat/enchantment"
import type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"

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
 * Reveal/hide/unlock are deliberately absent — they arrive with reveal-state in
 * M1/M2 (UNN-461 / UNN-464), per the lean M0 shape.
 */

/**
 * Zone-graph events (UNN-313) — mutate the spatial graph on the Map Instance
 * (`zones` + `adjacency`), never a combatant:
 *
 * - `addZone` records a new {@link import("./session").Zone}. The client may
 *   supply the stable `zoneId` (the encounter-setup surface mints it so the
 *   optimistic id matches the persisted one and a follow-up adjacency/placement
 *   edit can reference it before any refresh — UNN-347); when omitted the reducer
 *   mints it via its injectable `newId`. The client always supplies the display
 *   `name` and optional `notes`.
 * - `removeZone` drops a zone, prunes it from every adjacency list, and clears
 *   the Enchantment when it sat on the removed zone. It does **not** touch
 *   occupancy — token cleanup is a separate concern.
 * - `setZoneAdjacency` records (or clears) an **undirected** edge between two
 *   zones; idempotent — re-adding an existing edge does not duplicate it.
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
])

/** `true` only when `A` and `B` are mutually assignable (structurally equal). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

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
