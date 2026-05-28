import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/mechanics/state"

/**
 * Input schemas for the Warrior — Perfection owner controls (UNN-228).
 * `direction` drives step up/down through the same delta-clamping
 * transition the rules describe; the reset action takes no direction
 * because the rulebook only resets to D.
 */

const characterMutationBase = z.object({
  characterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export const AdjustPerfectionSchema = characterMutationBase.extend({
  direction: z.enum(["increment", "decrement"]),
})

export type AdjustPerfectionInput = z.input<typeof AdjustPerfectionSchema>

export const ResetPerfectionSchema = characterMutationBase
export type ResetPerfectionInput = z.input<typeof ResetPerfectionSchema>

export type PerfectionActionError = "invalid-input" | MechanicPersistenceError
