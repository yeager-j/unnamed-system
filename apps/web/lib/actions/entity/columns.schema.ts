import { z } from "zod/v4"

import { BUILDER_STEPS } from "@/domain/character/builder-steps"
import type { EntityGuardError } from "@/lib/actions/entity/version-guard"
import type { PortraitUploadError } from "@/lib/storage/portrait-upload"

/**
 * Wires for the two non-replayable/non-versioned column actions left after
 * replica contraction. Replayable entity-row columns are validated by the
 * `entity.setColumn` mutation registry instead.
 */

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

/** The portrait upload adds the Blob stage's failures to the column set. */
export type UploadEntityPortraitError =
  | "invalid-input"
  | EntityGuardError
  | PortraitUploadError
