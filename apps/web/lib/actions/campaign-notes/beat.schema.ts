import { z } from "zod/v4"

import { displayNameSchema } from "../display-name.schema"

export const CreateBeatSchema = z.object({
  campaignId: z.string(),
  /** The session folder it lands in; null/absent ⇒ Unfiled (D11). */
  folderId: z.string().nullish(),
  /** The quick-mint's typed name; absent ⇒ an untitled beat (the runner's mint). */
  title: displayNameSchema.optional(),
  /** Mint straight into a slot (the runner's "New story beat"). */
  slotId: z.string().optional(),
})
export type CreateBeatInput = z.input<typeof CreateBeatSchema>

export const DeleteBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
})
export type DeleteBeatInput = z.input<typeof DeleteBeatSchema>

export const DeferBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
})
export type DeferBeatInput = z.input<typeof DeferBeatSchema>

export const SetBeatResolvedSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  resolved: z.boolean(),
})
export type SetBeatResolvedInput = z.input<typeof SetBeatResolvedSchema>

export type BeatActionError =
  | "invalid-input"
  | "beat-not-found"
  | "folder-not-found"
  | "clock-not-found"
  | "scheduled-to-past"
  | "not-scheduled"
  | "slot-not-found"
  | "frozen-day"
  | "slot-occupied"
