import { z } from "zod/v4"

import { MAP_ZONE_MOTIFS, mapZoneSchema } from "./geometry.schema"

/**
 * The geometry-edit vocabulary — one edit the canvas dispatches over a
 * {@link import("./geometry.schema").MapGeometry}. `reduceMapGeometry` (PR2) applies
 * these as the standalone Map-template authoring core, and the Map-Instance reuses
 * the **same** vocabulary for in-console geometry editing: its `editGeometry` event
 * (see {@link import("./map-instance-event").MapInstanceEvent}) wraps one of these.
 *
 * Ids are **caller-minted** — the canvas needs the new id immediately for the
 * optimistic React-Flow node/edge it pushes — so an `addZone`/`duplicateZone`/
 * `addConnection` carries the id it creates.
 */

/** A connection's two independent fog/access flags. */
export type ConnectionFlag = "hidden" | "locked"

const pointSchema = mapZoneSchema.shape.position

/**
 * Runtime validator for one geometry edit arriving over the wire — the geometry half
 * of the Map-Instance's `editGeometry` boundary the impure shell parses before
 * handing it to the reducer. {@link MapGeometryEvent} is its inferred type.
 */
export const mapGeometryEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addZone"),
    id: z.string(),
    position: pointSchema,
    pageId: z.string(),
  }),
  z.object({
    kind: z.literal("duplicateZone"),
    sourceId: z.string(),
    newId: z.string(),
    position: pointSchema,
    pageId: z.string(),
  }),
  z.object({
    kind: z.literal("renameZone"),
    zoneId: z.string(),
    name: z.string(),
  }),
  z.object({
    kind: z.literal("setZoneText"),
    zoneId: z.string(),
    patch: z.object({
      description: z.string().optional(),
      dmNotes: z.string().optional(),
    }),
  }),
  z.object({
    kind: z.literal("setZoneIdentity"),
    zoneId: z.string(),
    // A partial patch of the three cosmetic identity fields. An **absent** field
    // means "no change"; `motif: null` is the explicit **clear** opcode (the "None"
    // picker) — the reducer deletes the key, so `null` is never persisted (the
    // load-schema fixed-point law). `size`/`mood` are set-only.
    identity: z.object({
      size: z.enum(["S", "M", "L", "XL"]).optional(),
      motif: z.enum(MAP_ZONE_MOTIFS).nullable().optional(),
      mood: z.enum(["warm", "dim", "cool"]).optional(),
    }),
  }),
  z.object({
    kind: z.literal("setZoneBinding"),
    zoneId: z.string(),
    // A partial patch of the three authored generation-binding fields (UNN-590,
    // D4). Same contract as `setZoneIdentity`: an **absent** field means "no
    // change"; `null` is the explicit **clear** opcode — the reducer deletes the
    // key so a cleared Zone deep-equals a never-set one (the load-schema
    // fixed-point law). `rollContentsAtStart` clears rather than storing `false`
    // (absent already means off).
    binding: z.object({
      templateKey: z.string().nullable().optional(),
      portalMapId: z.string().nullable().optional(),
      rollContentsAtStart: z.boolean().nullable().optional(),
    }),
  }),
  z.object({
    kind: z.literal("moveZone"),
    zoneId: z.string(),
    position: pointSchema,
  }),
  z.object({ kind: z.literal("deleteZone"), zoneId: z.string() }),
  // `zoneId: null` clears the entry designation; a non-null unknown Zone no-ops.
  // Single-select: setting an entry replaces any previous one (UNN-590, D4).
  z.object({ kind: z.literal("setEntryZone"), zoneId: z.string().nullable() }),
  z.object({
    kind: z.literal("addConnection"),
    id: z.string(),
    fromZoneId: z.string(),
    toZoneId: z.string(),
  }),
  z.object({
    kind: z.literal("setConnectionFlag"),
    connectionId: z.string(),
    flag: z.enum(["hidden", "locked"]),
    value: z.boolean(),
  }),
  z.object({ kind: z.literal("deleteConnection"), connectionId: z.string() }),
  z.object({
    kind: z.literal("addPage"),
    id: z.string(),
    // Absent/empty ⇒ the reducer derives "Page N" (lowest free).
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("renamePage"),
    pageId: z.string(),
    name: z.string(),
  }),
  // Cascade: removes the page, every Zone on it, and every connection touching
  // those Zones (severing cross-page links). No-op on the last remaining page.
  z.object({ kind: z.literal("deletePage"), pageId: z.string() }),
  z.object({
    kind: z.literal("duplicatePage"),
    sourcePageId: z.string(),
    newPageId: z.string(),
    // Caller-minted id maps (the same discipline as addZone — `editGeometry`
    // replays deterministically client- and server-side, so the reducer must
    // never mint): source Zone id → fresh copy id, and source connection id →
    // fresh copy id for the page's **intra-page** connections. Cross-page
    // connections are deliberately not copied.
    zoneIdMap: z.record(z.string(), z.string()),
    connectionIdMap: z.record(z.string(), z.string()),
  }),
  z.object({
    kind: z.literal("moveZoneToPage"),
    zoneId: z.string(),
    pageId: z.string(),
  }),
  // The page's procedural growth mode (UNN-590, D6). `null` clears the key —
  // an absent `growth` is the default (`edge`), decided at the consumer.
  z.object({
    kind: z.literal("setPageGrowth"),
    pageId: z.string(),
    growth: z.enum(["edge", "open"]).nullable(),
  }),
])

export type MapGeometryEvent = z.infer<typeof mapGeometryEventSchema>
