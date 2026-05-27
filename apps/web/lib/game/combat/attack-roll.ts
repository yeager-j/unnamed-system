import { getArchetype } from "../archetypes"
import type { PartyComposition } from "../character/state"
import {
  computeAttributes,
  type StatComputationCharacter,
} from "../character/stats/stats"
import { mechanicEffectsFor } from "../mechanics"
import type { Skill } from "../skills/schema"
import { resolveAttackAttribute } from "../skills/skill-display"
import type { SkillKind } from "../skills/skill-kind"
import type { DamageType } from "./affinity"
import type { AttackAttribute, Delivery } from "./attack"
import type {
  AttackRollEffect,
  AttackRollFilter,
  AttackRollScaler,
} from "./effects"

/**
 * Per-Skill / per-weapon Attack Roll resolution. Walks every contributor
 * — the rolling Attribute, the active mechanic, the active Archetype's
 * passive Skills — and folds their declared {@link AttackRollEffect}s
 * through filter + scaler resolution into one labelled, summed result. The
 * resolver is pure: no I/O, no React, deterministic, never mutates input —
 * same contract as {@link ./stats}.
 *
 * Why a structural context object instead of a `Skill`: weapon intrinsic
 * attacks also make Attack Rolls and need the same readout. The context is
 * the smallest shape that covers both — weapons synthesize
 * `{ kind: "attack", damageType, delivery, attribute }` from
 * {@link ./items/schema}'s `IntrinsicAttack`; Skills extract the same fields
 * from their definition via {@link skillAttackRollContext}.
 */

/** One labelled contributor to a resolved Attack Roll. Surfaced to the UI
 *  so the Skill card renders `Magic +4  Magic Circle +2` instead of an
 *  opaque `+6`. */
export interface AttackRollSource {
  source: string
  amount: number
}

/**
 * The complete labelled readout for one Attack Roll: every contributor
 * already summed and labelled, with the rolling Attribute as the first
 * source. Components only render — no addition happens client-side.
 */
export interface ResolvedAttackRoll {
  /** Grand total — rolling Attribute plus every matching effect contribution. */
  total: number
  /** Per-source breakdown, attribute first, then effects in collection order.
   *  Effect contributions resolving to 0 are omitted; the attribute is
   *  always present even at 0 so the player can see the base. */
  sources: AttackRollSource[]
}

/**
 * "What's making this Attack Roll" — the smallest view {@link resolveAttackRoll}
 * needs to evaluate filters and pick a rolling Attribute. `damageType` and
 * `delivery` are absent on Skill kinds that have neither (Ailment Skills);
 * the filter treats any axis whose context value is missing as a no-match
 * for that axis.
 */
export interface AttackRollContext {
  kind: SkillKind
  damageType?: DamageType | "special"
  delivery?: Delivery
  /** The Attribute added to this roll's d20 (per the rolling Skill or
   *  weapon's {@link ./attack#AttackRoll}). */
  attribute: AttackAttribute
}

/** Display labels for an {@link AttackAttribute}, used as the first source
 *  in {@link ResolvedAttackRoll.sources}. `"st-or-ma"` keeps both names so
 *  the breakdown stays honest about which is in play. */
export const ATTACK_ATTRIBUTE_LABELS = {
  st: "Strength",
  ma: "Magic",
  ag: "Agility",
  lu: "Luck",
  "st-or-ma": "Strength or Magic",
} as const satisfies Record<AttackAttribute, string>

export const EMPTY_RESOLVED_ATTACK_ROLL: ResolvedAttackRoll = {
  total: 0,
  sources: [],
}

/**
 * Derives the {@link AttackRollContext} for a Skill, returning `null` for
 * kinds that make no Attack Roll (passive / heal / support) or for attack
 * Skills that have no `attackRoll` table (severe flat-damage Skills).
 * Centralized so the loader and the Archetypes-tab entry builder agree on
 * what counts as an attack-rolling Skill.
 */
export function skillAttackRollContext(skill: Skill): AttackRollContext | null {
  if (skill.kind === "attack" && skill.attackRoll) {
    return {
      kind: skill.kind,
      damageType: skill.damageType,
      delivery: skill.delivery,
      attribute: skill.attackRoll.attribute,
    }
  }
  if (skill.kind === "ailment") {
    return { kind: skill.kind, attribute: skill.attackRoll.attribute }
  }
  return null
}

/**
 * Resolves the full Attack Roll readout for one Skill or weapon attack
 * against the given character and party. Returns the labelled grand total
 * — rolling Attribute first, then every matching effect contribution — so
 * the UI just renders.
 */
export function resolveAttackRoll(
  context: AttackRollContext,
  character: StatComputationCharacter,
  partyComposition: PartyComposition | null
): ResolvedAttackRoll {
  const attributes = computeAttributes(character)
  const attributeAmount = resolveAttackAttribute(context.attribute, attributes)
  const sources: AttackRollSource[] = [
    {
      source: ATTACK_ATTRIBUTE_LABELS[context.attribute],
      amount: attributeAmount,
    },
  ]
  let total = attributeAmount

  for (const effect of collectAttackRollEffects(character)) {
    if (!matchesFilter(effect.when, context)) continue
    const amount = resolveAmount(effect, character, partyComposition)
    if (amount === 0) continue
    total += amount
    sources.push({ source: effect.source ?? "Bonus", amount })
  }

  return { total, sources }
}

function collectAttackRollEffects(
  character: StatComputationCharacter
): AttackRollEffect[] {
  const effects: AttackRollEffect[] = []

  const active = character.activeMechanic
  if (active) {
    for (const effect of mechanicEffectsFor(active.kind, active.state, {
      stats: character,
    })) {
      if (effect.type === "attackRoll") effects.push(effect)
    }
  }

  for (const skill of character.activeSkills) {
    if (skill.kind !== "passive") continue
    for (const effect of skill.effects ?? []) {
      if (effect.type === "attackRoll") effects.push(effect)
    }
  }

  return effects
}

function matchesFilter(
  filter: AttackRollFilter | undefined,
  context: AttackRollContext
): boolean {
  if (!filter) return true
  if (
    filter.damageTypes &&
    !axisMatches(filter.damageTypes, context.damageType)
  )
    return false
  if (filter.deliveries && !axisMatches(filter.deliveries, context.delivery))
    return false
  if (filter.skillKinds && !axisMatches(filter.skillKinds, context.kind))
    return false
  return true
}

function axisMatches<T>(
  values: readonly T[],
  candidate: T | undefined
): boolean {
  return candidate !== undefined && values.includes(candidate)
}

function resolveAmount(
  effect: AttackRollEffect,
  character: StatComputationCharacter,
  partyComposition: PartyComposition | null
): number {
  if (effect.amount !== undefined) return effect.amount
  if (effect.scaler)
    return resolveScaler(effect.scaler, character, partyComposition)
  return 0
}

function resolveScaler(
  scaler: AttackRollScaler,
  character: StatComputationCharacter,
  partyComposition: PartyComposition | null
): number {
  if (scaler.kind === "perPartyLineage") {
    let count = partyComposition?.[scaler.lineage] ?? 0
    if (!scaler.includesSelf && shareActiveLineage(character, scaler.lineage)) {
      count = Math.max(0, count - 1)
    }
    return scaler.amount * count
  }
  return 0
}

function shareActiveLineage(
  character: StatComputationCharacter,
  lineage: AttackRollScaler["lineage"]
): boolean {
  const key = character.activeArchetypeKey
  if (!key) return false
  return getArchetype(key)?.lineage === lineage
}
