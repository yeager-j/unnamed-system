import { z } from "zod/v4"

/**
 * Input schema for {@link import("./expedition-create").createExpeditionAction}
 * (UNN-589 D5/D8): "New expedition" on a Region mints an ordinary `draft`
 * dungeon row + blank Instance exactly like the plain dungeon mint, plus
 * `regionId` — the client then lands on the existing prep screen. The seed Map
 * and wandering defaults come off the Region row, so the wire carries only the
 * region and a name.
 */
export const CreateExpeditionSchema = z.object({
  regionId: z.string(),
  name: z.string().trim().min(1).max(100),
})

export type CreateExpeditionInput = z.input<typeof CreateExpeditionSchema>

export type CreateExpeditionError =
  | "invalid-input"
  | "region-not-found"
  | "region-archived"
  | "map-not-found"
