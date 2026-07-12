import { z } from "zod/v4"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"
import { UPDATE_CATEGORIES } from "@/lib/db/schema/campaign-updates"

const concernRefSchema = z.object({
  kind: z.enum(PARTICIPANT_KINDS),
  id: z.string(),
})

const categorySchema = z.enum(UPDATE_CATEGORIES)

/**
 * A recorded activity's content: prose + a category, where **only Idle may
 * be empty-bodied** (PRD FR-2 — the one-click "did nothing substantial" mark;
 * a real category with no prose is a mis-tap, not a record).
 */
const activityContent = {
  body: z.string().max(10_000),
  category: categorySchema,
  concerns: z.array(concernRefSchema).max(20),
}

const bodyMatchesCategory = (input: {
  body: string
  category: z.infer<typeof categorySchema>
}) => input.body.trim() !== "" || input.category === "idle"

export const RecordActivitySchema = z
  .object({
    campaignId: z.string(),
    slotId: z.string(),
    characterId: z.string(),
    alsoCharacterIds: z.array(z.string()).max(20).default([]),
    ...activityContent,
  })
  .refine(bodyMatchesCategory, { message: "empty body requires idle" })
export type RecordActivityInput = z.input<typeof RecordActivitySchema>

export const EditActivitySchema = z
  .object({
    campaignId: z.string(),
    updateId: z.string(),
    ...activityContent,
  })
  .refine(bodyMatchesCategory, { message: "empty body requires idle" })
export type EditActivityInput = z.input<typeof EditActivitySchema>

export const DeleteActivitySchema = z.object({
  campaignId: z.string(),
  updateId: z.string(),
})
export type DeleteActivityInput = z.input<typeof DeleteActivitySchema>

export type ActivityActionError =
  | "invalid-input"
  | "invalid-ref"
  | "clock-not-found"
  | "slot-not-found"
  | "not-current-day"
  | "already-recorded"
  | "update-not-found"
