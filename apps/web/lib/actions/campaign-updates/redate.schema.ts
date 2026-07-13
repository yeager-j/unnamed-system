import { z } from "zod/v4"

import type { RedateUpdateError } from "@/lib/db/writes/campaign-updates"

/**
 * Input schema for {@link import("./redate").redateUpdateAction} (UNN-580):
 * a deliberate history edit — the day floor is the wire's only shape rule;
 * the future-day ceiling and the ⚑ refusal live in the write, where the
 * clock and the row are visible.
 */
export const RedateUpdateSchema = z.object({
  campaignId: z.string(),
  updateId: z.string(),
  day: z.number().int().min(1),
})

export type RedateUpdateInput = z.input<typeof RedateUpdateSchema>

export type RedateUpdateActionError = "invalid-input" | RedateUpdateError
