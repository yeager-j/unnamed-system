import { z } from "zod/v4"

import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { ENCHANTMENT_TYPES } from "@workspace/game-v2/kernel/vocab/enchantment"

import { mapGeometryEventSchema } from "./geometry-event"
import { mapZoneSchema } from "./geometry.schema"
import {
  generationStubSchema,
  zoneProvenanceSchema,
} from "./map-instance.schema"

/**
 * The spatial event vocabulary `reduceMapInstance` (PR2) dispatches over — the events
 * that mutate the {@link import("./map-instance.schema").MapInstanceState}: the zone
 * graph, token occupancy, engagement, the Zone Enchantment, the fog/reveal overlay,
 * and in-console geometry editing (which nests a {@link import("./geometry-event").MapGeometryEvent}).
 *
 * **The occupancy key is `tokenKey`** (ADR §2.4/§2.5): the key is opaque and
 * **dual-lifecycle** — a `participantId` during combat, a `characterId` during
 * exploration (where `moveCombatant` also moves party tokens). The spatial reducer
 * treats it as a plain string-map key — only `tokenKey` is a bare opaque string.
 * `targetCombatantIds` are branded `ParticipantId`s (engagement is combat-only),
 * matching the stored `engagementSchema` the reducer writes them into.
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
    connectionId: z.string().optional(),
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
    kind: z.literal("placeCombatant"),
    tokenKey: z.string(),
    zoneId: z.string(),
  }),
  z.object({
    kind: z.literal("setEngagement"),
    tokenKey: z.string(),
    targetCombatantIds: z.array(participantIdSchema).min(1),
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
  // ————— The generation family (UNN-590, D4) — every payload fully resolved
  // (D1): the roll happened server-side in the pure roller; reducers replay
  // deterministically and consult no randomness. Consuming an already-consumed
  // stub is the **benign no-op** the D8 retry contract requires (a committed-but-
  // response-lost retry finds the stub minted/closed/dead-ended and must surface
  // as nothing, never an error).
  z.object({
    kind: z.literal("mintZone"),
    stubId: z.string(),
    // The minted Zone, fully laid out (position from the layout, pageId, size,
    // templateKey stamped by the roller).
    zone: mapZoneSchema,
    // The minted connection takes `id := stubId` (exit-id continuity, D10);
    // carried explicitly so the payload is self-describing — the reducer trusts
    // it rather than re-deriving.
    connectionId: z.string(),
    // The minted Zone's own sprouted stubs (its onward frontier).
    stubs: z.array(generationStubSchema),
    provenance: zoneProvenanceSchema,
  }),
  z.object({
    kind: z.literal("closeLoop"),
    stubId: z.string(),
    connectionId: z.string(),
    toZoneId: z.string(),
  }),
  z.object({
    kind: z.literal("retractZone"),
    zoneId: z.string(),
    // The original stub, restored **byte-identical** (stored anchor included) so
    // the player payload after retract equals the pre-mint payload (D10).
    restoredStub: generationStubSchema,
  }),
  // The PRD's no-connector fallback: the stub is removed and the exit narrates
  // as collapsed rubble.
  z.object({ kind: z.literal("resolveDeadEnd"), stubId: z.string() }),
])

export type MapInstanceEvent = z.infer<typeof mapInstanceEventSchema>

/**
 * The instance-side **generation family** (UNN-590). Exported so the app's
 * generic single-row event path can refuse them without a hand-maintained list:
 * a generation event is only sound inside its paired two-row transaction (a
 * `mintZone` without its `recordMint`/`advanceCursors` breaks D4's pairing
 * invariants), so P3b gives them dedicated actions and the generic path rejects.
 */
export const GENERATION_INSTANCE_EVENT_KINDS = [
  "mintZone",
  "closeLoop",
  "retractZone",
  "resolveDeadEnd",
] as const satisfies readonly MapInstanceEvent["kind"][]

/** Events that may be applied directly to one Map Instance. Generation events
 * are excluded because they require a paired Dungeon transaction. */
export type DirectMapInstanceEvent = Exclude<
  MapInstanceEvent,
  { kind: (typeof GENERATION_INSTANCE_EVENT_KINDS)[number] }
>
