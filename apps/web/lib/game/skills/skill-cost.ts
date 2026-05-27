import {
  computeMaxHP,
  type StatComputationCharacter,
} from "../character/stats/stats"
import type { Skill } from "./schema"

/**
 * Resolves a Skill's symbolic cost to a concrete, payable number and decides
 * whether a character can afford to cast it. Pure and side-effect free: it
 * neither rolls damage, applies target effects, nor mutates the character —
 * those are out of scope per PRD §7.2. Deducting the cost and the undo log are
 * sheet/UI concerns handled elsewhere.
 */

/** A Skill's cost resolved to a concrete pool and integer amount. */
export type ResolvedSkillCost = { kind: "sp" | "hp"; amount: number }

/**
 * A {@link StatComputationCharacter} plus the two live, tracked combat pools.
 * `currentHP`/`currentSP` are mutable session state (not derived), so they
 * stay off the pure derived-value view and ride along here for the cast check.
 */
export interface CastingCharacter extends StatComputationCharacter {
  currentHP: number
  currentSP: number
}

/**
 * Resolves a Skill's cost for display and affordability checks. A flat SP cost
 * passes through unchanged; an HP-percentage cost resolves against the
 * character's current (derived) max HP, rounded down to an integer with a
 * floor of 1 (PRD §7.2, rulebook `3.3 On Your Turn` "Skill Costs"). The
 * floor-at-1 stops a Skill that declares a non-zero `hp-percent` cost from
 * resolving to a free cast at very low max HP — a Skill defined to cost HP
 * should always charge at least 1. Returns `null` for Skills with no cost
 * (passive Skills carry none), meaning there is nothing to pay.
 */
export function resolveSkillCost(
  skill: Skill,
  character: CastingCharacter
): ResolvedSkillCost | null {
  if (!("cost" in skill)) return null

  const { cost } = skill
  if (cost.kind === "sp") return { kind: "sp", amount: cost.amount }

  const maxHP = computeMaxHP(character)
  const amount = Math.max(1, Math.floor((maxHP * cost.amount) / 100))
  return { kind: "hp", amount }
}

/**
 * Whether the character can pay a Skill's resolved cost. SP costs need
 * `currentSP >= amount`; HP costs need `currentHP > amount` (strictly greater —
 * a Skill can never drop the caster to 0 HP, PRD §7.2). A costless Skill is
 * always castable.
 */
export function canCast(skill: Skill, character: CastingCharacter): boolean {
  const cost = resolveSkillCost(skill, character)
  if (cost === null) return true

  if (cost.kind === "sp") return character.currentSP >= cost.amount
  return character.currentHP > cost.amount
}
