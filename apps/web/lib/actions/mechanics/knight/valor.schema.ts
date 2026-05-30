import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

import { characterMutationBase } from "../../character-mutation.schema"

/**
 * Input schema for the Knight — Valor stepper (UNN-227). The action accepts
 * a direction rather than a target value: clamping (0..VALOR_MAX) lives in
 * the pure {@link adjustValor} transition, so the server is the only place
 * that decides the new value.
 */
export const AdjustValorSchema = characterMutationBase.extend({
  direction: z.enum(["increment", "decrement"]),
})

export type AdjustValorInput = z.input<typeof AdjustValorSchema>

export type AdjustValorError = "invalid-input" | MechanicPersistenceError
