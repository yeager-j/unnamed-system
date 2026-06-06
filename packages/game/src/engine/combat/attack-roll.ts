import { getArchetype } from "@workspace/game/archetypes"
import {
  computeAttributes,
  type AttributeScores,
  type StatComputationCharacter,
} from "@workspace/game/character"
import {
  ATTACK_ATTRIBUTE_LABELS,
  type AttackAttribute,
  type Delivery,
} from "@workspace/game/engine/combat/attack"
import { resolveAttackAttribute } from "@workspace/game/engine/skills/utils"
import type { PartyComposition } from "@workspace/game/foundation/character/state"
import type { DamageType } from "@workspace/game/foundation/combat/affinity"
import type {
  AttackRollEffect,
  AttackRollFilter,
  AttackRollScaler,
} from "@workspace/game/foundation/combat/effects"
import type { Skill } from "@workspace/game/foundation/skills/schema"
import { mechanicEffectsFor } from "@workspace/game/mechanics"
import type { SkillKind } from "@workspace/game/skills"

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
  return resolveAttackRollFrom(
    context,
    computeAttributes(character),
    collectAttackRollEffects(character),
    (effect) => resolveAmount(effect, character, partyComposition)
  )
}

/**
 * The source-agnostic core of {@link resolveAttackRoll}: given already-resolved
 * Attributes and a list of candidate {@link AttackRollEffect}s, folds the
 * rolling Attribute and every matching effect into one labelled, summed
 * readout. The character path supplies computed Attributes plus its active
 * mechanic / passive-Skill effects; an enemy stat block supplies its flat
 * Attributes plus the effects of its own passive Skills. `resolveEffectAmount`
 * lets each caller resolve scaler effects against whatever context it has —
 * party composition for a character, a fixed amount for an enemy.
 */
export function resolveAttackRollFrom(
  context: AttackRollContext,
  attributes: AttributeScores,
  effects: readonly AttackRollEffect[],
  resolveEffectAmount: (effect: AttackRollEffect) => number
): ResolvedAttackRoll {
  const attributeAmount = resolveAttackAttribute(context.attribute, attributes)
  const sources: AttackRollSource[] = [
    {
      source: ATTACK_ATTRIBUTE_LABELS[context.attribute],
      amount: attributeAmount,
    },
  ]
  let total = attributeAmount

  for (const effect of effects) {
    if (!matchesFilter(effect.when, context)) continue
    const amount = resolveEffectAmount(effect)
    if (amount === 0) continue
    total += amount
    sources.push({ source: effect.source ?? "Bonus", amount })
  }

  return { total, sources }
}

function collectAttackRollEffects(
  character: StatComputationCharacter
): AttackRollEffect[] {
  // Stryker disable next-line ArrayDeclaration: equivalent — a junk seed element resolves to a 0 contribution and is dropped in the fold.
  const effects: AttackRollEffect[] = []

  const active = character.activeMechanic
  if (active) {
    // Stryker disable next-line ObjectLiteral: equivalent — no current mechanic reads the `stats` context, so dropping it changes nothing.
    for (const effect of mechanicEffectsFor(active.kind, active.state, {
      stats: character,
    })) {
      // Stryker disable next-line ConditionalExpression: equivalent — non-attackRoll mechanic effects (e.g. Valor's affinity) carry no amount, so including one resolves to 0 and is dropped downstream.
      if (effect.type === "attackRoll") effects.push(effect)
    }
  }

  effects.push(...attackRollEffectsFromSkills(character.activeSkills))

  return effects
}

/**
 * The `attackRoll` effects declared by the passive Skills in a list. Shared by
 * the character path (its active Archetype's passive Skills) and the enemy path
 * (a stat block's own Skills) so both fold passive Attack-Roll bonuses
 * identically. Non-passive Skills carry no structured effects and are skipped.
 */
export function attackRollEffectsFromSkills(
  skills: readonly Skill[]
): AttackRollEffect[] {
  const effects: AttackRollEffect[] = []
  for (const skill of skills) {
    // Stryker disable next-line ConditionalExpression: equivalent — non-passive Skills carry no `effects`, so not skipping them adds nothing.
    if (skill.kind !== "passive") continue
    // Stryker disable next-line ArrayDeclaration: equivalent — a junk fallback element is filtered out by the attackRoll type check below.
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
  // Stryker disable next-line ConditionalExpression: equivalent — the undefined guard is for typing; values.includes(undefined) is already false.
  return candidate !== undefined && values.includes(candidate)
}

function resolveAmount(
  effect: AttackRollEffect,
  character: StatComputationCharacter,
  partyComposition: PartyComposition | null
): number {
  if (effect.amount !== undefined) return effect.amount
  // Stryker disable next-line ConditionalExpression: equivalent — when reached (amount is undefined) a valid effect always carries a scaler.
  if (effect.scaler)
    return resolveScaler(effect.scaler, character, partyComposition)
  return 0
}

function resolveScaler(
  scaler: AttackRollScaler,
  character: StatComputationCharacter,
  partyComposition: PartyComposition | null
): number {
  // Stryker disable next-line ConditionalExpression: equivalent — perPartyLineage is currently the only scaler kind.
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
  // Stryker disable next-line ConditionalExpression: equivalent — getArchetype(null) is undefined, so the fallthrough returns false for a null key anyway.
  if (!key) return false
  return getArchetype(key)?.lineage === lineage
}
