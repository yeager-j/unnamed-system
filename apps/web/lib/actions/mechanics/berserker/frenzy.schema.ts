import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

import { characterMutationBase } from "../../character-mutation.schema"

/**
 * Input schema for the Berserker — Frenzy Pain stepper. Like Valor, the action
 * takes a direction rather than a target value: clamping (0..FRENZY_PAIN_MAX,
 * plus the exit-at-0 rule) lives in the pure {@link adjustPain} transition, so
 * the server is the only place that decides the new value.
 */
export const AdjustPainSchema = characterMutationBase.extend({
  direction: z.enum(["increment", "decrement"]),
})

export type AdjustPainInput = z.input<typeof AdjustPainSchema>

export type AdjustPainError = "invalid-input" | MechanicPersistenceError

/**
 * Input schema for the Berserker — Frenzy Mode toggle. The action takes the
 * target boolean; the server reads the row and sets the flag (entering requires
 * at least 1 Pain — enforced in the pure {@link setFrenzyMode} transition).
 */
export const SetFrenzyModeSchema = characterMutationBase.extend({
  frenzyMode: z.boolean(),
})

export type SetFrenzyModeInput = z.input<typeof SetFrenzyModeSchema>

export type SetFrenzyModeError = "invalid-input" | MechanicPersistenceError
