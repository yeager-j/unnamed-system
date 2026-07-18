import { z } from "zod/v4"

import { regionSettingsSchema } from "@workspace/game-v2/generation"

/**
 * Input schema for {@link import("./create").createRegionAction} (UNN-589). A
 * Region is scoped to a campaign, named, and bound to a **seed Map** and a
 * **Template Set** — both picked by their public `shortId` (the client deals in
 * shortIds; the action resolves each to a row id, ownership-checked against the
 * DM). `settings` is the authored generation defaults ({@link regionSettingsSchema}
 * — the wandering-table designation + cadence, validated against the Set's content
 * server-side). No `expectedVersion`: create has no prior version to guard against,
 * mirroring `CreateDungeonSchema`.
 */
export const CreateRegionSchema = z.object({
  campaignId: z.string(),
  name: z.string().trim().min(1).max(100),
  seedMapShortId: z.string(),
  templateSetShortId: z.string(),
  settings: regionSettingsSchema,
})

export type CreateRegionInput = z.input<typeof CreateRegionSchema>

export type CreateRegionError =
  | "invalid-input"
  | "map-not-found"
  | "template-set-not-found"
  | "wandering-table-not-found"
