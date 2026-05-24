import { z } from "zod/v4"

import type { CharacterIdentityPersistenceError } from "@/lib/db/character-identity"
import type { PortraitUploadError } from "@/lib/storage/portrait-upload"

/**
 * Input schemas for the identity-class write actions in
 * `character-identity.ts`. Lives in its own file because a `"use server"`
 * module can only export async functions — keeping these here lets client
 * components pre-validate before paying for a round-trip.
 */

/**
 * Pronouns are stored as free text (trimmed). 64 chars matches the limit on
 * the sheet header so the display can't overflow into truncation. Empty is
 * persisted as `null` (the field is optional on the data model).
 */
export const UpdateCharacterPronounsSchema = z.object({
  characterId: z.string().min(1),
  pronouns: z.string().trim().max(64),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateCharacterPronounsInput = z.input<
  typeof UpdateCharacterPronounsSchema
>
export type UpdateCharacterPronounsError =
  | "invalid-input"
  | CharacterIdentityPersistenceError

/**
 * Clears the `portraitUrl` pointer on the row (the Blob object itself is
 * left behind — Blob doesn't bill on idle storage hard enough to justify the
 * GC plumbing today).
 */
export const RemoveCharacterPortraitSchema = z.object({
  characterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveCharacterPortraitInput = z.input<
  typeof RemoveCharacterPortraitSchema
>
export type RemoveCharacterPortraitError =
  | "invalid-input"
  | CharacterIdentityPersistenceError

/**
 * Tracks the highest step the player has reached in the wizard so the
 * "Resume building" card on My Characters can deep-link to the right step.
 * Bounded by the BUILDER_STEPS array length (currently 5).
 */
export const SetBuilderStepSchema = z.object({
  characterId: z.string().min(1),
  step: z.number().int().min(0).max(99),
  expectedVersion: z.number().int().nonnegative(),
})
export type SetBuilderStepInput = z.input<typeof SetBuilderStepSchema>
export type SetBuilderStepError =
  | "invalid-input"
  | CharacterIdentityPersistenceError

/**
 * Portrait upload submits a multipart FormData — the action peels the file
 * + ids out and validates them directly (no Zod, since File isn't really a
 * Zod-friendly value). Errors enumerate both upload-side failures and
 * persistence-side ones so the client can choose copy.
 */
export type UploadCharacterPortraitError =
  | "invalid-input"
  | PortraitUploadError
  | CharacterIdentityPersistenceError
