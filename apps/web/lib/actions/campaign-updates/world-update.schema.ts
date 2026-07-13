import { z } from "zod/v4"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"
import { UPDATE_CATEGORIES } from "@/lib/db/schema/campaign-updates"

const participantRefSchema = z.object({
  kind: z.enum(PARTICIPANT_KINDS),
  id: z.string(),
})

/**
 * Input schema for {@link import("./world-update").authorWorldUpdateAction}
 * (UNN-579): a slot-less update primaried on the mounting page's entity.
 * Body is required — "empty body only for idle" is the app rule, and a world
 * update is never idle.
 */
export const AuthorWorldUpdateSchema = z.object({
  campaignId: z.string(),
  primary: participantRefSchema,
  body: z.string().trim().min(1).max(10_000),
  category: z.enum(UPDATE_CATEGORIES).nullable(),
  concerns: z.array(participantRefSchema).max(20),
})

export type AuthorWorldUpdateInput = z.input<typeof AuthorWorldUpdateSchema>

export type AuthorWorldUpdateError =
  | "invalid-input"
  | "invalid-ref"
  | "clock-not-found"
