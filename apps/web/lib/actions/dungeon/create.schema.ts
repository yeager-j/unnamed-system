import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create").createDungeonAction} (UNN-465). A new
 * dungeon is scoped to a campaign, named, and built by **selecting a Map** (by its
 * public `shortId` — the client deals in shortIds, since an inline-created Map
 * surfaces a shortId too). The Map mints the dungeon's blank Map Instance; the
 * geometry snapshot is deferred to UNN-464. No `{ id, expectedVersion }` envelope —
 * create has no prior version to guard against, mirroring `CreateEncounterSchema`.
 */
export const CreateDungeonSchema = z.object({
  campaignId: z.string(),
  mapShortId: z.string(),
  name: z.string().trim().min(1).max(100),
})

export type CreateDungeonInput = z.input<typeof CreateDungeonSchema>

export type CreateDungeonError = "invalid-input" | "map-not-found"
