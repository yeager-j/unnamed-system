import { z } from "zod/v4"

import type { CharacterKnifePersistenceError } from "@/lib/db/writes/knives"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the Step-3 Knives actions. Title + description updates
 * are split into two actions so a fast-typing player can write one of them
 * without an in-flight save of the other clobbering it via a stale-closure
 * full-row write (the bug the split fixes; see UNN-207 review).
 */

export const AddKnifeSchema = characterMutationBase.extend({
  /**
   * Empty allowed: the writer view ([UNN-211]) seeds a new Knife with no
   * title so the placeholder ("Untitled Knife") cues the player to type
   * one. The sidebar shows "New Knife" until they do (Notion's "New page"
   * pattern). Per-write actions can still bound the max length.
   */
  title: z.string().trim().max(120),
  description: z.string().max(4000).optional(),
})
export type AddKnifeInput = z.input<typeof AddKnifeSchema>

export const UpdateKnifeTitleSchema = characterMutationBase.extend({
  knifeId: z.string().min(1),
  /** Empty allowed — clearing a title is a legitimate edit. */
  title: z.string().trim().max(120),
})
export type UpdateKnifeTitleInput = z.input<typeof UpdateKnifeTitleSchema>

export const UpdateKnifeDescriptionSchema = characterMutationBase.extend({
  knifeId: z.string().min(1),
  description: z.string().max(4000),
})
export type UpdateKnifeDescriptionInput = z.input<
  typeof UpdateKnifeDescriptionSchema
>

export const RemoveKnifeSchema = characterMutationBase.extend({
  knifeId: z.string().min(1),
})
export type RemoveKnifeInput = z.input<typeof RemoveKnifeSchema>

export type KnifeActionError = "invalid-input" | CharacterKnifePersistenceError
