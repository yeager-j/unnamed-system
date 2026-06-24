import type { ScalerContext } from "@workspace/game-v2/combat/party"
import type {
  AttackRollSource,
  ResolvedAttackRoll,
} from "@workspace/game-v2/combat/resolved"
import type {
  AttackRollEffect,
  AttackRollFilter,
  AttackRollScaler,
} from "@workspace/game-v2/kernel/effects.schema"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { DamageType } from "@workspace/game-v2/kernel/vocab/affinity"
import {
  ATTACK_ATTRIBUTE_LABELS,
  type AttackAttribute,
  type Delivery,
} from "@workspace/game-v2/kernel/vocab/attack"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab/attributes"
import type { SkillKind } from "@workspace/game-v2/kernel/vocab/skills"

/**
 * Per-Skill / per-weapon Attack Roll resolution (ported from v1
 * `engine/combat/attack-roll.ts`). Folds the rolling Attribute and every matching
 * {@link AttackRollEffect} (through filter + scaler resolution) into one labelled,
 * summed {@link ResolvedAttackRoll}. Pure: no I/O, deterministic, never mutates
 * input.
 *
 * v2 consumes the pre-collected effects `resolve` surfaces as
 * {@link ResolvedEntity}`.components.pendingEffects.attackRoll` (the active
 * mechanic + zone-enchantment channel today; passive skills join the same channel
 * in PR5/PR6). The contributor *order* is owned by the effect-channel assembly in
 * `resolve-entity.ts`, not here — see its note.
 */

/**
 * "What's making this Attack Roll" — the smallest view the resolver needs to
 * evaluate filters and pick a rolling Attribute. `damageType`/`delivery` are
 * absent on Skill kinds that have neither (Ailment Skills); the filter treats any
 * axis whose context value is missing as a no-match for that axis.
 */
export interface AttackRollContext {
  kind: SkillKind
  damageType?: DamageType | "special"
  delivery?: Delivery
  /** The Attribute added to this roll's d20 (per the rolling Skill/weapon). */
  attribute: AttackAttribute
}

const ZERO_ATTRIBUTES: AttributeScores = {
  strength: 0,
  magic: 0,
  agility: 0,
  luck: 0,
}

/**
 * Resolves an {@link AttackAttribute} symbol to a concrete Attribute score.
 * `"st-or-ma"` picks the higher of Strength and Magic per the rulebook
 * convention. (Lifted from v1 `skills/utils.ts` — the combat resolver is its only
 * consumer here; `skills/` re-imports it when that PR lands.)
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
 * The source-agnostic core: given already-resolved Attributes and a list of
 * candidate {@link AttackRollEffect}s, folds the rolling Attribute and every
 * matching effect into one labelled, summed readout. `resolveEffectAmount` lets
 * each caller resolve scaler effects against whatever context it has — a
 * {@link ScalerContext} for a character, a fixed amount for an enemy.
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

/**
 * Resolves the full Attack Roll readout for one attack against a resolved entity.
 * Reads the resolved Attributes and the pending attack-roll effects the entity
 * carries, resolving any `perPartyLineage` scaler against the injected
 * {@link ScalerContext} (`null` for an enemy / any caller with no party context,
 * collapsing every scaler to 0). Serves both PCs and enemies — see `party.ts`.
 */
export function resolveAttackRoll(
  context: AttackRollContext,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null
): ResolvedAttackRoll {
  const attributes = resolved.components.attributes ?? ZERO_ATTRIBUTES
  const effects = resolved.components.pendingEffects?.attackRoll ?? []
  return resolveAttackRollFrom(context, attributes, effects, (effect) =>
    resolveAmount(effect, scaler)
  )
}

/**
 * Whether an effect's {@link AttackRollFilter} matches an {@link AttackRollContext}
 * — each present axis is a positive list the context value must be in; an omitted
 * axis always matches. Shared with the damage-bonus resolver, which filters
 * {@link import("@workspace/game-v2/kernel/effects.schema").DamageEffect}s by the
 * same `when` shape.
 */
export function matchesFilter(
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
  scaler: ScalerContext | null
): number {
  if (effect.amount !== undefined) return effect.amount
  if (effect.scaler) return resolveScaler(effect.scaler, scaler)
  return 0
}

function resolveScaler(
  scaler: AttackRollScaler,
  context: ScalerContext | null
): number {
  if (scaler.kind === "perPartyLineage") {
    let count = context?.partyComposition?.[scaler.lineage] ?? 0
    if (!scaler.includesSelf && context?.activeLineage === scaler.lineage) {
      count = Math.max(0, count - 1)
    }
    return scaler.amount * count
  }
  return 0
}
