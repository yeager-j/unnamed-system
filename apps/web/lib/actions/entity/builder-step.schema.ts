import { z } from "zod/v4"

import { BUILDER_STEPS } from "@/domain/character/builder-steps"

/**
 * Builder step is **unguarded** (R3 — UNN-573): it lives on the `playerCharacter`
 * subtype, not the version-tokened `entity` row, so its wire carries only the
 * target and the step — no expected revision. Single-author builder navigation;
 * keeping it off the identity class also stops it falsely staling an in-flight
 * name autosave, and keeps it out of the identity axis protocol (UNN-675) — it
 * advances no modeled version column, so there is nothing to stamp.
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
