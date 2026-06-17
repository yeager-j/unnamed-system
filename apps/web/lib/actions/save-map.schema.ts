import { z } from "zod/v4"

import { mapGeometrySchema } from "@workspace/game/foundation"

/**
 * Input schema for {@link import("./save-map").saveMapAction} (UNN-460) — the
 * autosave write (no Save button). The `patch` is a discriminated union over the
 * field being saved: the **name** arm is wired by the editor shell now; the
 * **geometry** arm is the write UNN-461's React Flow canvas calls on node-drag /
 * adjacency edits. `expectedVersion` is the optimistic-concurrency token the
 * client round-trips per save (the server bumps it and returns the new value).
 */
export const SaveMapSchema = z.object({
  mapId: z.string(),
  expectedVersion: z.number().int().min(0),
  patch: z.discriminatedUnion("field", [
    z.object({
      field: z.literal("name"),
      name: z.string().trim().min(1).max(100),
    }),
    z.object({
      field: z.literal("geometry"),
      geometry: mapGeometrySchema,
    }),
  ]),
})

export type SaveMapInput = z.input<typeof SaveMapSchema>

export type SaveMapError = "invalid-input" | "map-not-found" | "stale"
