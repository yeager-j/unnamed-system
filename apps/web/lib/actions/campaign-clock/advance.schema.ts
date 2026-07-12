import { z } from "zod/v4"

import { UPDATE_CATEGORIES } from "@/lib/db/schema/campaign-updates"

/**
 * A montage-pass entry (D1): real prose required — an empty "did nothing"
 * mark is exactly what *omitting* the character from the pass already says,
 * so Idle is excluded; an entry exists to record growth.
 */
const montageEntrySchema = z.object({
  characterId: z.string(),
  body: z.string().trim().min(1).max(10_000),
  category: z.enum(UPDATE_CATEGORIES).exclude(["idle"]),
})

/**
 * Input schemas for {@link import("./advance").advanceClockAction} and
 * {@link import("./advance").unAdvanceClockAction} (D1/D6). `days: 1` is the
 * plain advance; `days > 1` is a time-skip — one write either way. The cap is
 * a runaway guard (a fat-fingered skip must not materialize thousands of slot
 * rows), not a game rule. A time-skip may carry the optional **montage pass**
 * — per-character entries stamped on the landing day. Un-advance is strictly
 * one day at a time, so it carries no `days`.
 */
export const AdvanceClockSchema = z.object({
  campaignId: z.string(),
  days: z.number().int().min(1).max(365),
  expectedVersion: z.number().int().min(0),
  montage: z.array(montageEntrySchema).max(20).optional(),
})

export type AdvanceClockInput = z.input<typeof AdvanceClockSchema>

export type AdvanceClockError =
  | "invalid-input"
  | "clock-not-found"
  | "stale"
  | "deadline-due"
  | "montage-character-invalid"

export const UnAdvanceClockSchema = z.object({
  campaignId: z.string(),
  expectedVersion: z.number().int().min(0),
})

export type UnAdvanceClockInput = z.input<typeof UnAdvanceClockSchema>

export type UnAdvanceClockError = AdvanceClockError | "at-floor"
