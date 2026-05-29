import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

/**
 * Input schema for the Knight — Valor stepper (UNN-227). The action accepts
 * a direction rather than a target value: clamping (0..VALOR_MAX) lives in
 * the pure {@link adjustValor} transition, so the server is the only place
 * that decides the new value.
 */
export const AdjustValorSchema = z.object({
  characterId: z.string().min(1),
  direction: z.enum(["increment", "decrement"]),
  expectedVersion: z.number().int().nonnegative(),
})

export type AdjustValorInput = z.input<typeof AdjustValorSchema>

export type AdjustValorError = "invalid-input" | MechanicPersistenceError
