import { z } from "zod/v4"

import { PERIOD_KINDS } from "@/domain/planner/period"

/**
 * Input schemas for {@link import("./period").setPeriodAction} /
 * {@link import("./period").clearPeriodAction} (D1, FR-8, UNN-629): sparse
 * inherit-forward markers keyed `(campaignId, kind, day)`. Last-write-wins —
 * no `expectedVersion` (D6: annoying, not corrupting).
 */
export const SetPeriodSchema = z.object({
  campaignId: z.string(),
  kind: z.enum(PERIOD_KINDS),
  day: z.number().int().min(1),
  label: z.string().trim().min(1).max(60),
})

export type SetPeriodInput = z.input<typeof SetPeriodSchema>

export const ClearPeriodSchema = z.object({
  campaignId: z.string(),
  kind: z.enum(PERIOD_KINDS),
  day: z.number().int().min(1),
})

export type ClearPeriodInput = z.input<typeof ClearPeriodSchema>

export type PeriodError = "invalid-input"
