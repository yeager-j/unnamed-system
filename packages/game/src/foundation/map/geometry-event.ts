import { z } from "zod/v4"

import type { Equals } from "@workspace/game/foundation/equals"
import {
  mapZoneSchema,
  type MapZone,
} from "@workspace/game/foundation/map/geometry"

/**
 * The geometry-edit vocabulary — one edit the canvas dispatches over a
 * {@link import("./geometry").MapGeometry}. {@link import("@workspace/game/engine") reduceMapGeometry}
 * is the pure reducer that applies these (the Map-template authoring core, UNN-485),
 * and the Map Instance reuses the **same** vocabulary for in-console geometry
 * editing (UNN-486): its `editGeometry` event wraps one of these and delegates to
 * `reduceMapGeometry`.
 *
 * Ids are **caller-minted** — the canvas needs the new id immediately for the
 * optimistic React-Flow node/edge it pushes — so an `addZone`/`duplicateZone`/
 * `addConnection` carries the id it creates.
 *
 * **Home (UNN-486):** the type + {@link ConnectionFlag} were lifted here from the
 * engine reducer when the Instance began event-sourcing geometry edits over the
 * wire. Unlike the template (which autosaves the whole blob, so its events never
 * cross a trust boundary), the Instance's `editGeometry` arrives in an untrusted
 * client payload, so it needs the runtime {@link mapGeometryEventSchema}. The
 * engine reducer re-exports the type + `ConnectionFlag` so its existing consumers
 * are unaffected.
 */

type Point = MapZone["position"]

/** A connection's two independent fog/access flags (§3.5). */
export type ConnectionFlag = "hidden" | "locked"

/**
 * One geometry edit. Ids are caller-minted (see the module doc): an `addZone`/
 * `duplicateZone`/`addConnection` carries the id it creates.
 */
export type MapGeometryEvent =
  | { kind: "addZone"; id: string; position: Point }
  | { kind: "duplicateZone"; sourceId: string; newId: string; position: Point }
  | { kind: "renameZone"; zoneId: string; name: string }
  | {
      kind: "setZoneText"
      zoneId: string
      patch: Partial<Pick<MapZone, "description" | "dmNotes">>
    }
  | { kind: "moveZone"; zoneId: string; position: Point }
  | { kind: "deleteZone"; zoneId: string }
  | { kind: "addConnection"; id: string; fromZoneId: string; toZoneId: string }
  | {
      kind: "setConnectionFlag"
      connectionId: string
      flag: ConnectionFlag
      value: boolean
    }
  | { kind: "deleteConnection"; connectionId: string }

const pointSchema = mapZoneSchema.shape.position

/**
 * Runtime validator for a {@link MapGeometryEvent} arriving over the wire (UNN-486)
 * — the geometry half of the Map Instance's `editGeometry` boundary the impure
 * shell parses before handing it to `reduceMapInstance`. Mirrors the hand-written
 * {@link MapGeometryEvent} union member-for-member; the lockstep assertion below
 * stops the two from drifting.
 */
export const mapGeometryEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addZone"),
    id: z.string(),
    position: pointSchema,
  }),
  z.object({
    kind: z.literal("duplicateZone"),
    sourceId: z.string(),
    newId: z.string(),
    position: pointSchema,
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
    kind: z.literal("moveZone"),
    zoneId: z.string(),
    position: pointSchema,
  }),
  z.object({ kind: z.literal("deleteZone"), zoneId: z.string() }),
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
])

/**
 * Compile-time lockstep guard: if {@link mapGeometryEventSchema} and the
 * hand-written {@link MapGeometryEvent} union ever diverge, this assignment stops
 * compiling.
 */
const _mapGeometryEventSchemaInSync: Equals<
  z.infer<typeof mapGeometryEventSchema>,
  MapGeometryEvent
> = true
void _mapGeometryEventSchemaInSync
