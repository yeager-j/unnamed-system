import { z } from "zod/v4"

import type { CharacterKnifePersistenceError } from "@/lib/db/writes/knives"

/**
 * Input schemas for the Step-3 Knives actions. Title + description updates
 * are split into two actions so a fast-typing player can write one of them
 * without an in-flight save of the other clobbering it via a stale-closure
 * full-row write (the bug the split fixes; see UNN-207 review).
 */

export const AddKnifeSchema = z.object({
  characterId: z.string().min(1),
  /**
   * Empty allowed: the writer view ([UNN-211]) seeds a new Knife with no
   * title so the placeholder ("Untitled Knife") cues the player to type
   * one. The sidebar shows "New Knife" until they do (Notion's "New page"
   * pattern). Per-write actions can still bound the max length.
   */
  title: z.string().trim().max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddKnifeInput = z.input<typeof AddKnifeSchema>

export const UpdateKnifeTitleSchema = z.object({
  characterId: z.string().min(1),
  knifeId: z.string().min(1),
  /** Empty allowed — clearing a title is a legitimate edit. */
  title: z.string().trim().max(120),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateKnifeTitleInput = z.input<typeof UpdateKnifeTitleSchema>

export const UpdateKnifeDescriptionSchema = z.object({
  characterId: z.string().min(1),
  knifeId: z.string().min(1),
  description: z.string().max(4000),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateKnifeDescriptionInput = z.input<
  typeof UpdateKnifeDescriptionSchema
>

export const RemoveKnifeSchema = z.object({
  characterId: z.string().min(1),
  knifeId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveKnifeInput = z.input<typeof RemoveKnifeSchema>

export type KnifeActionError = "invalid-input" | CharacterKnifePersistenceError
