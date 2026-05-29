import { z } from "zod/v4"

import type { CharacterChainPersistenceError } from "@/lib/db/writes/chains"

/**
 * Input schemas for the Step-3 Chains actions. Mirrors the Knives shape;
 * see `character-knives.schema.ts` for the rationale on splitting title
 * and description into separate actions.
 */

export const AddChainSchema = z.object({
  characterId: z.string().min(1),
  /**
   * Empty allowed — the writer view ([UNN-211]) seeds a new Chain with
   * no title; sidebar shows "New Chain" until the player types one.
   */
  title: z.string().trim().max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddChainInput = z.input<typeof AddChainSchema>

export const UpdateChainTitleSchema = z.object({
  characterId: z.string().min(1),
  chainId: z.string().min(1),
  /** Empty allowed — clearing a title is a legitimate edit. */
  title: z.string().trim().max(120),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateChainTitleInput = z.input<typeof UpdateChainTitleSchema>

export const UpdateChainDescriptionSchema = z.object({
  characterId: z.string().min(1),
  chainId: z.string().min(1),
  description: z.string().max(4000),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateChainDescriptionInput = z.input<
  typeof UpdateChainDescriptionSchema
>

export const RemoveChainSchema = z.object({
  characterId: z.string().min(1),
  chainId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveChainInput = z.input<typeof RemoveChainSchema>

export type ChainActionError = "invalid-input" | CharacterChainPersistenceError
