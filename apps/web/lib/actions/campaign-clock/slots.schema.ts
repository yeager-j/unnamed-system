import { z } from "zod/v4"

/** A slot's display label ("Morning", "Night watch") — short, non-empty. */
export const slotLabelSchema = z.string().trim().min(1).max(40)

/**
 * Input schemas for the per-day slot edits
 * ({@link import("./slots").addSlotAction} /
 * {@link import("./slots").renameSlotAction}, D1): row edits on one day,
 * never the template. A slot's `day` is immutable, so rename carries no day —
 * the row is addressed by `slotId` and validated against the gated campaign
 * (§5's boundary rule).
 */
export const AddSlotSchema = z.object({
  campaignId: z.string(),
  day: z.number().int().min(1),
  label: slotLabelSchema,
  expectedVersion: z.number().int().min(0),
})

export type AddSlotInput = z.input<typeof AddSlotSchema>

export type AddSlotError =
  | "invalid-input"
  | "clock-not-found"
  | "stale"
  | "frozen-day"
  | "day-not-materialized"

export const RenameSlotSchema = z.object({
  campaignId: z.string(),
  slotId: z.string(),
  label: slotLabelSchema,
  expectedVersion: z.number().int().min(0),
})

export type RenameSlotInput = z.input<typeof RenameSlotSchema>

export type RenameSlotError =
  | "invalid-input"
  | "clock-not-found"
  | "stale"
  | "frozen-day"
  | "slot-not-found"
