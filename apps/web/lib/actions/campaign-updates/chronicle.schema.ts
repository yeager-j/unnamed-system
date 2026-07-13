import { z } from "zod/v4"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"
import { UPDATE_CATEGORIES } from "@/lib/db/schema/campaign-updates"

/**
 * Input schema for {@link import("./chronicle").loadChroniclePageAction}
 * (UNN-580): the Chronicle's older-page fetch. The cursor stays an opaque
 * string on the wire — the action decodes it and treats garbage as
 * `invalid-input` rather than silently restarting from the top.
 */
export const LoadChroniclePageSchema = z.object({
  campaignId: z.string(),
  cursor: z.string(),
  filters: z.object({
    participant: z
      .object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string() })
      .nullable(),
    category: z.enum(UPDATE_CATEGORIES).nullable(),
    showIdle: z.boolean(),
  }),
})

export type LoadChroniclePageInput = z.input<typeof LoadChroniclePageSchema>

export type LoadChroniclePageActionError = "invalid-input"
