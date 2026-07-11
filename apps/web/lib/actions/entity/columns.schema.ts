import { z } from "zod/v4"

import { BUILDER_STEPS } from "@/domain/character/builder-steps"
import type { EntityGuardError } from "@/lib/actions/entity/version-guard"
import type { PortraitUploadError } from "@/lib/storage/portrait-upload"

import { entityMutationBase } from "./entity-mutation.schema"

/**
 * The per-field column-action wires (ADR §2.4's "classic per-field Server
 * Actions" species — name / pronouns / portrait / builder step). One schema per
 * field, all extending the aggregate envelope; every action guards the
 * **identity** class.
 */

/** Mirrors v1's name rules: trimmed, required, 64-char cap. */
export const UpdateEntityNameSchema = entityMutationBase.extend({
  name: z.string().trim().min(1, "Name is required").max(64),
})
export type UpdateEntityNameInput = z.input<typeof UpdateEntityNameSchema>

export const UpdateEntityPronounsSchema = entityMutationBase.extend({
  pronouns: z.string().max(64),
})
export type UpdateEntityPronounsInput = z.input<
  typeof UpdateEntityPronounsSchema
>

export const SetEntityBuilderStepSchema = entityMutationBase.extend({
  step: z
    .number()
    .int()
    .min(0)
    .max(BUILDER_STEPS.length - 1),
})
export type SetEntityBuilderStepInput = z.input<
  typeof SetEntityBuilderStepSchema
>

export const RemoveEntityPortraitSchema = entityMutationBase
export type RemoveEntityPortraitInput = z.input<
  typeof RemoveEntityPortraitSchema
>

export type EntityColumnActionError = "invalid-input" | EntityGuardError

/** The portrait upload adds the Blob stage's failures to the column set. */
export type UploadEntityPortraitError =
  | EntityColumnActionError
  | PortraitUploadError
