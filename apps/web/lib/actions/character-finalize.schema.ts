import { z } from "zod/v4"

import type { GatedStepSlug } from "@/components/builder/builder-step-gates"
import type { CharacterFinalizePersistenceError } from "@/lib/db/writes/finalize"

/**
 * Input + error types for {@link finalizeCharacterAction}. Kept in its own
 * file so client components can pre-validate before paying for a round-trip
 * (a `"use server"` module only exports async functions).
 */

export const FinalizeCharacterSchema = z.object({
  characterId: z.string().min(1),
  /** The `identityVersion` token at the moment the player clicked Create. */
  expectedVersion: z.number().int().nonnegative(),
})

export type FinalizeCharacterInput = z.input<typeof FinalizeCharacterSchema>

/**
 * Surfaced when a finalize attempt fails a wizard-step gate (PRD §5.2 +
 * UNN-207/208 minima). Carries the failing step's slug so the client can
 * render a "Fix in {step}" link instead of a generic toast.
 */
export interface MissingRequirementFailure {
  kind: "missing-requirement"
  stepSlug: GatedStepSlug
  reason: string
}

export type FinalizeCharacterError =
  | "invalid-input"
  | CharacterFinalizePersistenceError
  | MissingRequirementFailure
