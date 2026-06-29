import { z } from "zod/v4"

import { ENCHANTMENT_TYPES } from "@workspace/game-v2/kernel/vocab/enchantment"

import { mapGeometryEventSchema } from "./geometry-event"

/**
 * The spatial event vocabulary `reduceMapInstance` (PR2) dispatches over — the events
 * that mutate the {@link import("./map-instance.schema").MapInstanceState}: the zone
 * graph, token occupancy, engagement, the Zone Enchantment, the fog/reveal overlay,
 * and in-console geometry editing (which nests a {@link import("./geometry-event").MapGeometryEvent}).
 *
 * **The occupancy key is `tokenKey`** (ADR §2.4/§2.5): the key is opaque and
 * **dual-lifecycle** — a `participantId` during combat, a `characterId` during
 * exploration (where `moveCombatant` also moves party tokens). The spatial reducer
 * treats it as a plain string-map key. `targetCombatantIds` keeps its name —
 * engagement is combat-only, so the targets are combatant slots.
 *
 * The combat-vs-spatial routing predicate is deferred to the consumer's
 * untrusted-event boundary (Phase B / C1), where both unions are visible; v2 routes
 * by parse (`mapInstanceEventSchema.safeParse`), not a kind-membership list.
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
    tokenKey: z.string(),
    toZoneId: z.string(),
  }),
  z.object({
    kind: z.literal("setEngagement"),
    tokenKey: z.string(),
    targetCombatantIds: z.array(z.string()).min(1),
  }),
  z.object({ kind: z.literal("clearEngagement"), tokenKey: z.string() }),
  z.object({
    kind: z.literal("applyEnchantment"),
    zoneId: z.string(),
    enchantment: z.enum(ENCHANTMENT_TYPES),
  }),
  z.object({ kind: z.literal("clearEnchantment") }),
  z.object({ kind: z.literal("revealZone"), zoneId: z.string() }),
  z.object({ kind: z.literal("hideZone"), zoneId: z.string() }),
  z.object({ kind: z.literal("revealConnection"), connectionId: z.string() }),
  z.object({ kind: z.literal("hideConnection"), connectionId: z.string() }),
  z.object({ kind: z.literal("unlockConnection"), connectionId: z.string() }),
  z.object({ kind: z.literal("lockConnection"), connectionId: z.string() }),
  z.object({
    kind: z.literal("editGeometry"),
    event: mapGeometryEventSchema,
  }),
])

export type MapInstanceEvent = z.infer<typeof mapInstanceEventSchema>
