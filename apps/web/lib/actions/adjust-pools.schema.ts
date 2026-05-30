import { z } from "zod/v4"

import type {
  AdjustPoolPersistenceError,
  UsePrismaPersistenceError,
} from "@/lib/db/writes/adjust-pools"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the header owner-mode pool adjustments
 * (PRD §6.1 / §7.6, UNN-155). Damage / Heal / Spend SP / Recover SP all share
 * the same `{ amount }` shape — a positive integer that the engine clamps to
 * the pool's floor or ceiling. Use Prisma has no amount; the engine
 * decrements by 1. All five are vitals-class writes, so the client sends the
 * {@link characters.vitalsVersion} token it last saw.
 */

const AmountAdjustSchema = characterMutationBase.extend({
  amount: z.number().int().positive(),
})

export const DamageSchema = AmountAdjustSchema
export type DamageInput = z.input<typeof DamageSchema>

export const HealSchema = AmountAdjustSchema
export type HealInput = z.input<typeof HealSchema>

export const SpendSPSchema = AmountAdjustSchema
export type SpendSPInput = z.input<typeof SpendSPSchema>

export const RecoverSPSchema = AmountAdjustSchema
export type RecoverSPInput = z.input<typeof RecoverSPSchema>

export const UsePrismaSchema = characterMutationBase
export type UsePrismaInput = z.input<typeof UsePrismaSchema>

export type AdjustPoolActionError = "invalid-input" | AdjustPoolPersistenceError

export type UsePrismaActionError = "invalid-input" | UsePrismaPersistenceError
