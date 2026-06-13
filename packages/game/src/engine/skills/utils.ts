import {
  computeMaxHP,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"
import { type AttributeScores } from "@workspace/game/foundation/archetypes/schema"
import { type HydratedSkill } from "@workspace/game/foundation/character/hydrated-character"
import { DAMAGE_TYPES } from "@workspace/game/foundation/combat/affinity"
import {
  type AttackAttribute,
  type ResolvedAttackRoll,
} from "@workspace/game/foundation/combat/attack"
import { type DamageBonus } from "@workspace/game/foundation/combat/effects"
import type { SkillKind } from "@workspace/game/foundation/common"
import { err, ok, type Result } from "@workspace/game/foundation/result"
import type {
  ResolvedSkillCost,
  Skill,
  SkillCost,
} from "@workspace/game/foundation/skills/schema"

/**
 * Display order for the Combat-tab Skills list (UNN-198): attackers should
 * find their offense lines first without scanning past Passives. Separate from
 * `SKILL_KINDS` in `./skill-kind`, which is a vocabulary tuple and not
 * intended as a render order.
 */
export const SKILL_KIND_DISPLAY_ORDER = [
  "attack",
  "heal",
  "ailment",
  "support",
  "passive",
] as const satisfies readonly SkillKind[]

const KIND_INDEX: Record<SkillKind, number> = Object.fromEntries(
  SKILL_KIND_DISPLAY_ORDER.map((kind, index) => [kind, index])
) as Record<SkillKind, number>

const DAMAGE_TYPE_INDEX: Record<string, number> = Object.fromEntries(
  DAMAGE_TYPES.map((type, index) => [type, index])
)

/** Damage-type-less skills (or unknown values like `"special"`) sort after
 *  every known damage type. */
const DAMAGE_TYPE_FALLBACK = DAMAGE_TYPES.length

function damageTypeRank(skill: HydratedSkill): number {
  if (skill.kind !== "attack") return DAMAGE_TYPE_FALLBACK
  const rank = DAMAGE_TYPE_INDEX[skill.damageType]
  return rank ?? DAMAGE_TYPE_FALLBACK
}

/**
 * Sorts the hydrated Skills the Combat tab renders. Primary: kind, per
 * {@link SKILL_KIND_DISPLAY_ORDER}. Secondary for attack Skills: damage type,
 * per {@link DAMAGE_TYPES} (slash → pierce → strike → fire → … → almighty).
 * Final tiebreaker: alphabetical by name. Pure — returns a new array and does
 * not mutate the input.
 */
export function sortSkillsByKind(skills: HydratedSkill[]): HydratedSkill[] {
  return [...skills].sort((a, b) => {
    const kindDelta = KIND_INDEX[a.kind] - KIND_INDEX[b.kind]
    if (kindDelta !== 0) return kindDelta
    const damageDelta = damageTypeRank(a) - damageTypeRank(b)
    if (damageDelta !== 0) return damageDelta
    return a.name.localeCompare(b.name)
  })
}

/**
 * Assembles a {@link HydratedSkill} from a {@link Skill} and its derived
 * values, narrowing the result onto the matching distributed variant.
 * Cost-bearing Skill kinds receive a non-null `resolvedCost`; the passive
 * variant receives `null`. Centralized here so the three hydration call
 * sites (`lib/db/queries/load-character.ts`, archetype detail builders) stop
 * branching manually and downstream consumers gain TS narrowing on
 * `"cost" in skill` (UNN-231).
 */
export function hydrateSkill(
  skill: Skill,
  maxHP: number,
  resolvedAttackRoll: ResolvedAttackRoll | null,
  resolvedDamageBonuses: DamageBonus[] = []
): HydratedSkill {
  if ("cost" in skill) {
    return {
      ...skill,
      resolvedCost: resolveCost(skill.cost, maxHP),
      resolvedAttackRoll,
      resolvedDamageBonuses,
    }
  }
  return {
    ...skill,
    resolvedCost: null,
    resolvedAttackRoll,
    resolvedDamageBonuses,
  }
}

/**
 * A {@link StatContext} plus the two live, tracked combat pools.
 * `currentHP`/`currentSP` are mutable session state (not derived), so they
 * stay off the pure derived-value view and ride along here for the cast check.
 */
export interface CastContext extends StatContext {
  currentHP: number
  currentSP: number
}

/**
 * Resolves a Skill's cost for display and affordability checks. A flat SP cost
 * passes through unchanged; an HP-percentage cost resolves against the given
 * (derived) max HP, rounded down to an integer with a floor of 1 (PRD §7.2,
 * rulebook `3.3 On Your Turn` "Skill Costs"). The floor-at-1 stops a Skill that
 * declares a non-zero `hp-percent` cost from resolving to a free cast at very
 * low max HP — a Skill defined to cost HP should always charge at least 1.
 * Takes the resolved `maxHP` rather than the whole character so an enemy stat
 * block (flat `maxHP`, no archetype) can resolve a cost too. Returns `null` for
 * Skills with no cost (passive Skills carry none), meaning there is nothing to pay.
 */
export function resolveSkillCost(
  skill: Skill,
  maxHP: number
): ResolvedSkillCost | null {
  if (!("cost" in skill)) return null
  return resolveCost(skill.cost, maxHP)
}

/** Resolves a raw {@link SkillCost} to its concrete pool + integer amount.
 *  The non-null path of {@link resolveSkillCost}, extracted so the hydration
 *  helper (and any future consumer that already knows the Skill is
 *  cost-bearing) can resolve a cost without re-discriminating the skill. */
export function resolveCost(cost: SkillCost, maxHP: number): ResolvedSkillCost {
  if (cost.kind === "sp") return { kind: "sp", amount: cost.amount }
  const amount = Math.max(1, Math.floor((maxHP * cost.amount) / 100))
  return { kind: "hp", amount }
}

/** The two combat pools every pool-mutating engine operates on. Subset of
 *  {@link CastContext} so the optimistic reducer and the Cast button —
 *  which only have the live pools, not the full computation context — can
 *  share the engine's affordability + deduction logic via {@link canAfford}
 *  and {@link applyResolvedCost}. */
export interface SkillPools {
  currentHP: number
  currentSP: number
}

/** Recoverable failures the cast engine reports — same pool affordances
 *  {@link canAfford} checks, surfaced as discrete codes so the UI /
 *  persistence layer can disambiguate without re-deriving them. */
export type CastError = "insufficient-sp" | "insufficient-hp"

/**
 * Whether a {@link SkillPools} snapshot can pay a {@link ResolvedSkillCost}
 * (PRD §7.2). SP needs `currentSP >= amount`; HP needs `currentHP > amount`
 * (strictly greater — a Skill can never drop the caster to 0 HP). The cost
 * has already been resolved by {@link resolveSkillCost} elsewhere, so this
 * function makes no assumptions about how the character's max HP relates to
 * the percentage that produced the cost.
 */
export function canAfford(cost: ResolvedSkillCost, pools: SkillPools): boolean {
  if (cost.kind === "sp") return pools.currentSP >= cost.amount
  return pools.currentHP > cost.amount
}

/**
 * Deducts a {@link ResolvedSkillCost} from the matching pool, returning the
 * new {@link SkillPools} snapshot or the matching {@link CastError} when the
 * character can't pay. Pure and side-effect free: returns a fresh object and
 * never mutates its input. The single place pool-deduction math lives, so
 * the server engine, the optimistic reducer, and the Cast button affordability
 * check all share one implementation (UNN-231).
 */
export function applyResolvedCost(
  cost: ResolvedSkillCost,
  pools: SkillPools
): Result<SkillPools, CastError> {
  if (!canAfford(cost, pools)) {
    return err(cost.kind === "sp" ? "insufficient-sp" : "insufficient-hp")
  }
  if (cost.kind === "sp") {
    return ok({ ...pools, currentSP: pools.currentSP - cost.amount })
  }
  return ok({ ...pools, currentHP: pools.currentHP - cost.amount })
}

/**
 * Whether the character can pay a Skill's resolved cost. Composes
 * {@link resolveSkillCost} with {@link canAfford}; costless passives are
 * always castable.
 */
export function canCast(skill: Skill, character: CastContext): boolean {
  const cost = resolveSkillCost(skill, computeMaxHP(character))
  if (cost === null) return true
  return canAfford(cost, character)
}

/**
 * Deducts a Skill's resolved cost from the matching pool (PRD §7.2). Pure
 * and side-effect free: returns a fresh {@link CastContext} and never
 * mutates its input. Cost-less Skills (passives) return the character
 * unchanged so the engine stays total; the UI gates whether a Cast button
 * exists. Affordability + deduction route through the shared
 * {@link applyResolvedCost} primitive — see UNN-231 for why.
 */
export function applyCast(
  skill: Skill,
  character: CastContext
): Result<CastContext, CastError> {
  const cost = resolveSkillCost(skill, computeMaxHP(character))
  if (cost === null) return ok(character)

  const result = applyResolvedCost(cost, character)
  if (!result.ok) return result
  return ok({ ...character, ...result.value })
}

/**
 * Resolves an {@link AttackAttribute} symbol to the character's concrete
 * Attribute score. `"st-or-ma"` picks the higher of Strength and Magic per
 * the rulebook convention — the engine doesn't expose a separate "either"
 * stat.
 */
export function resolveAttackAttribute(
  attr: AttackAttribute,
  attributes: AttributeScores
): number {
  switch (attr) {
    case "st":
      return attributes.strength
    case "ma":
      return attributes.magic
    case "ag":
      return attributes.agility
    case "lu":
      return attributes.luck
    case "st-or-ma":
      return Math.max(attributes.strength, attributes.magic)
  }
}

/**
 * Maps the human-readable Attribute names used in authored formulas to their
 * {@link AttackAttribute} keys. Ordered longest-first so the regex prefers
 * `"St or Ma"` over the bare `"St"` / `"Ma"` that would otherwise match it
 * twice.
 */
const FORMULA_ATTRIBUTE_NAMES = [
  ["St or Ma", "st-or-ma"],
  ["St", "st"],
  ["Ma", "ma"],
  ["Ag", "ag"],
  ["Lu", "lu"],
] as const satisfies ReadonlyArray<readonly [string, AttackAttribute]>

const FORMULA_ATTRIBUTE_BY_NAME: Record<string, AttackAttribute> =
  Object.fromEntries(FORMULA_ATTRIBUTE_NAMES)

const FORMULA_PATTERN = new RegExp(
  `\\s*([+−-])\\s*(${FORMULA_ATTRIBUTE_NAMES.map(([name]) => name).join("|")})\\b`,
  "g"
)

/**
 * Substitutes Attribute abbreviations in a formula with the character's
 * concrete scores so an authored `"1d8 + Ma"` renders as `"1d8 + 4"`. Handles
 * a leading `+` / `-` operator so a negative score renders as `"− 1"` instead
 * of `"+ -1"`.
 */
export function hydrateFormula(
  formula: string,
  attributes: AttributeScores
): string {
  return formula.replace(
    FORMULA_PATTERN,
    (_match, op: string, name: string) => {
      const base = resolveAttackAttribute(
        FORMULA_ATTRIBUTE_BY_NAME[name]!,
        attributes
      )
      const signed = op === "+" ? base : -base
      return ` ${formatSignedBonus(signed)}`
    }
  )
}

export function formatSignedBonus(value: number): string {
  return value < 0 ? `− ${Math.abs(value)}` : `+ ${value}`
}
