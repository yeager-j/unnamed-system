import { z } from "zod/v4"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"

const relationEndpointSchema = z.object({
  kind: z.enum(PARTICIPANT_KINDS),
  id: z.string(),
})

/** Input schemas for the relation edge writes (UNN-579, §3). */
export const AddRelationSchema = z.object({
  campaignId: z.string(),
  source: relationEndpointSchema,
  target: relationEndpointSchema,
  label: z.string().trim().max(200).nullable(),
  alsoReverse: z.boolean(),
})

export const RemoveRelationSchema = z.object({
  campaignId: z.string(),
  relationId: z.string(),
})

export type AddRelationInput = z.input<typeof AddRelationSchema>
export type RemoveRelationInput = z.input<typeof RemoveRelationSchema>

export type AddRelationError = "invalid-input" | "invalid-ref"
export type RemoveRelationError = "invalid-input" | "relation-not-found"
