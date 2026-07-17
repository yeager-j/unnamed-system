import {
  isCastable,
  type ResolvedSkillCost,
  type Skill,
  type SkillCost,
} from "@workspace/game-v2/skills/skill.schema"
import { err, ok, type Result } from "@workspace/result"

/**
 * Skill **cost & cast** primitives, ported from v1 `engine/skills/utils.ts`. The
 * load-bearing asymmetry is preserved verbatim (D14/D15): SP is inclusive (`>=`),
 * HP is strict (`>`) — a Skill can never drop the caster to 0 HP / self-Fall.
 *
 * **v2 depletion adaptation:** v1 returned mutated `{currentHP, currentSP}` pools;
 * v2 stores *depletion* (`damage`/`spSpent`) and derives currents, so the apply
 * returns a {@link CostPayment} (which pool, how much) that the cast flow then
 * spends via `vitals/operations` `applyDamage`/`applySpendSP` — only on success,
 * since those ops are total/unclamped and an unguarded spend would bypass the
 * no-self-Fall guarantee.
 */

/** The resolved current pools affordability reads (NOT the authored depletion —
 *  `currentHP = max(0, maxHP − damage)`, possibly over-max when `damage < 0`). */
export interface CastPools {
  currentHP: number
  currentSP: number
}

/** Recoverable cast failures — the two pool affordances surfaced as discrete codes. */
export type CastError = "insufficient-sp" | "insufficient-hp"

/** The deduction a cast incurs: which pool to spend from and how much. The cast
 *  flow applies it via `applySpendSP` (sp) / `applyDamage` (hp). */
export interface CostPayment {
  pool: "sp" | "hp"
  amount: number
}

/**
 * Resolves a raw {@link SkillCost} to its concrete pool + integer amount. A flat
 * SP cost passes through; an HP-percentage cost resolves against `maxHP`, **rounded
 * down with a floor of 1** (a non-zero `hp-percent` cost never resolves to a free
 * cast). Multiply-before-divide. Takes the resolved `maxHP` so an enemy statblock
 * (flat maxHP, no archetype) can resolve a cost too.
 */
export function resolveCost(cost: SkillCost, maxHP: number): ResolvedSkillCost {
  if (cost.kind === "sp") return { kind: "sp", amount: cost.amount }
  const amount = Math.max(1, Math.floor((maxHP * cost.amount) / 100))
  return { kind: "hp", amount }
}

/** Resolves a Skill's cost, or `null` for a non-castable passive (no `cost` facet —
 *  nothing to pay, distinct from a zero-amount cost which the schema disallows). */
export function resolveSkillCost(
  skill: Skill,
  maxHP: number
): ResolvedSkillCost | null {
  if (!isCastable(skill)) return null
  return resolveCost(skill.cost, maxHP)
}

/**
 * Whether a {@link CastPools} snapshot can pay a {@link ResolvedSkillCost}. SP needs
 * `currentSP >= amount`; HP needs `currentHP > amount` (**strictly greater** — a
 * cost equal to current HP is unaffordable, so a Skill never self-Falls).
 */
export function canAfford(cost: ResolvedSkillCost, pools: CastPools): boolean {
  if (cost.kind === "sp") return pools.currentSP >= cost.amount
  return pools.currentHP > cost.amount
}

/**
 * Checks affordability and returns the {@link CostPayment} to spend, or the
 * matching {@link CastError} when the caster can't pay. Pure — produces **no**
 * payment on failure, so the cast flow's total/unclamped spend never runs unless
 * the cost is affordable.
 */
export function applyResolvedCost(
  cost: ResolvedSkillCost,
  pools: CastPools
): Result<CostPayment, CastError> {
  if (!canAfford(cost, pools)) {
    return err(cost.kind === "sp" ? "insufficient-sp" : "insufficient-hp")
  }
  return ok({ pool: cost.kind, amount: cost.amount })
}

/** Whether the character can cast `skill`. Costless passives are always castable. */
export function canCast(
  skill: Skill,
  maxHP: number,
  pools: CastPools
): boolean {
  const cost = resolveSkillCost(skill, maxHP)
  if (cost === null) return true
  return canAfford(cost, pools)
}

/**
 * The payment a cast incurs: `ok(null)` for a costless passive (a no-op success,
 * not an error — the engine stays total), else the {@link CostPayment} or a
 * {@link CastError}. The caller applies a non-null payment to the depletion fields.
 */
export function applyCast(
  skill: Skill,
  maxHP: number,
  pools: CastPools
): Result<CostPayment | null, CastError> {
  const cost = resolveSkillCost(skill, maxHP)
  if (cost === null) return ok(null)
  return applyResolvedCost(cost, pools)
}
