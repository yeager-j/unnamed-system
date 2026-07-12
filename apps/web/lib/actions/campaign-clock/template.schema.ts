import { z } from "zod/v4"

import { slotLabelSchema } from "./slots.schema"

/**
 * Input schema for {@link import("./template").setSlotTemplateAction} (Manage
 * Campaign → "Day structure", D1). Minimum one entry mirrors the DB CHECK —
 * you can never stand on a day without slots; the max is a sanity cap on a
 * hand-edited list.
 */
export const SetSlotTemplateSchema = z.object({
  campaignId: z.string(),
  slotTemplate: z
    .array(z.object({ label: slotLabelSchema }))
    .min(1)
    .max(12),
  expectedVersion: z.number().int().min(0),
})

export type SetSlotTemplateInput = z.input<typeof SetSlotTemplateSchema>

export type SetSlotTemplateError = "invalid-input" | "clock-not-found" | "stale"
