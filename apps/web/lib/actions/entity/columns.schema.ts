import { z } from "zod/v4"

import { BUILDER_STEPS } from "@/domain/character/builder-steps"
import {
  entityNameValueSchema,
  entityNotesValueSchema,
  entityPronounsValueSchema,
} from "@/domain/entity/replica/mutations"
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
  name: entityNameValueSchema,
})
export type UpdateEntityNameInput = z.input<typeof UpdateEntityNameSchema>

export const UpdateEntityPronounsSchema = entityMutationBase.extend({
  pronouns: entityPronounsValueSchema,
})
export type UpdateEntityPronounsInput = z.input<
  typeof UpdateEntityPronounsSchema
>

/**
 * Notes is the free-form `notes` app column (table-facing, visible to every
 * viewer). The 8000-char cap matches the narrative prose fields
 * (`NARRATIVE_TEXT_MAX`) so both long-form surfaces share one bound.
 */
export const UpdateEntityNotesSchema = entityMutationBase.extend({
  notes: entityNotesValueSchema,
})
export type UpdateEntityNotesInput = z.input<typeof UpdateEntityNotesSchema>

/**
 * Builder step is **unguarded** (R3 — UNN-573): it lives on the `playerCharacter`
 * subtype, not the version-tokened `entity` row, so its wire carries only the
 * target and the step — no `expectedVersion`. Single-author builder navigation;
 * moving it off the identity class also stops it falsely staling an in-flight name
 * autosave.
 */
export const SetEntityBuilderStepSchema = z.object({
  entityId: z.string().min(1),
  step: z
    .number()
    .int()
    .min(0)
    .max(BUILDER_STEPS.length - 1),
})
export type SetEntityBuilderStepInput = z.input<
  typeof SetEntityBuilderStepSchema
>
export type SetEntityBuilderStepError = "invalid-input" | "entity-not-found"

export const RemoveEntityPortraitSchema = entityMutationBase
export type RemoveEntityPortraitInput = z.input<
  typeof RemoveEntityPortraitSchema
>

export type EntityColumnActionError = "invalid-input" | EntityGuardError

/** The portrait upload adds the Blob stage's failures to the column set. */
export type UploadEntityPortraitError =
  | EntityColumnActionError
  | PortraitUploadError
