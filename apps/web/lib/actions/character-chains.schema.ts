import { z } from "zod/v4"

import type { CharacterChainPersistenceError } from "@/lib/db/writes/chains"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the Step-3 Chains actions. Mirrors the Knives shape;
 * see `character-knives.schema.ts` for the rationale on splitting title
 * and description into separate actions.
 */

export const AddChainSchema = characterMutationBase.extend({
  /**
   * Empty allowed — the writer view ([UNN-211]) seeds a new Chain with
   * no title; sidebar shows "New Chain" until the player types one.
   */
  title: z.string().trim().max(120),
  description: z.string().max(4000).optional(),
})
export type AddChainInput = z.input<typeof AddChainSchema>

export const UpdateChainTitleSchema = characterMutationBase.extend({
  chainId: z.string().min(1),
  /** Empty allowed — clearing a title is a legitimate edit. */
  title: z.string().trim().max(120),
})
export type UpdateChainTitleInput = z.input<typeof UpdateChainTitleSchema>

export const UpdateChainDescriptionSchema = characterMutationBase.extend({
  chainId: z.string().min(1),
  description: z.string().max(4000),
})
export type UpdateChainDescriptionInput = z.input<
  typeof UpdateChainDescriptionSchema
>

export const RemoveChainSchema = characterMutationBase.extend({
  chainId: z.string().min(1),
})
export type RemoveChainInput = z.input<typeof RemoveChainSchema>

export type ChainActionError = "invalid-input" | CharacterChainPersistenceError
