import { err, ok, type Result } from "../../result"

/**
 * Manual HP/SP/Prisma adjustments triggered from the sheet header's owner-mode
 * affordance (PRD §6.1 / §7.6): the player enters a number and either spends
 * or recovers a pool. These are intentionally engine-light — no costs, no
 * affinity, no clamping rules other than the pool's floor/ceiling — because
 * they cover narrative or DM-driven HP/SP changes that don't flow through any
 * other engine (Cast, Rest, Attack). All five functions are pure: callers
 * project a hydrated character down to the minimum input shape and persist
 * the returned pool field via the vitals-class wrapper in
 * `lib/db/adjust-pools.ts`.
 *
 * Amount validation (positive integer) lives in the Server Action Zod schema;
 * the engine accepts a non-negative integer and does the clamp.
 */

/** Caller-bug guard: every adjust function rejects a non-positive amount. */
export type AdjustAmountError = "non-positive-amount"

/**
 * Use Prisma failure: the flask is empty. The header button is disabled at
 * 0 charges, so this is a defensive check; the engine still refuses.
 */
export type UsePrismaError = "no-prisma-charges"

/**
 * Take damage: current HP minus `amount`, floored at 0 (Fallen at 0 — the
 * `isFallen` predicate in `state.ts` reads the same column).
 */
export function applyDamage(
  character: { currentHP: number },
  amount: number
): Result<{ currentHP: number }, AdjustAmountError> {
  if (amount <= 0) return err("non-positive-amount")
  return ok({ currentHP: Math.max(0, character.currentHP - amount) })
}

/** Heal: current HP plus `amount`, clamped at the derived max HP. */
export function applyHeal(
  character: { currentHP: number; maxHP: number },
  amount: number
): Result<{ currentHP: number }, AdjustAmountError> {
  if (amount <= 0) return err("non-positive-amount")
  return ok({
    currentHP: Math.min(character.maxHP, character.currentHP + amount),
  })
}

/** Spend SP: current SP minus `amount`, floored at 0. */
export function applySpendSP(
  character: { currentSP: number },
  amount: number
): Result<{ currentSP: number }, AdjustAmountError> {
  if (amount <= 0) return err("non-positive-amount")
  return ok({ currentSP: Math.max(0, character.currentSP - amount) })
}

/** Recover SP: current SP plus `amount`, clamped at the derived max SP. */
export function applyRecoverSP(
  character: { currentSP: number; maxSP: number },
  amount: number
): Result<{ currentSP: number }, AdjustAmountError> {
  if (amount <= 0) return err("non-positive-amount")
  return ok({
    currentSP: Math.min(character.maxSP, character.currentSP + amount),
  })
}

/**
 * Use Prisma: decrement charges by 1. The player rolls and adjusts HP
 * manually for the MVP (PRD §7.6); this engine touches charges only. Refuses
 * at 0 charges so a tampered click can't drive the column negative.
 */
export function applyUsePrisma(character: {
  prismaCharges: number
}): Result<{ prismaCharges: number }, UsePrismaError> {
  if (character.prismaCharges <= 0) return err("no-prisma-charges")
  return ok({ prismaCharges: character.prismaCharges - 1 })
}
