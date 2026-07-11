import { getSideEffect } from "@workspace/game-v2/combat"
import type { AttackTier } from "@workspace/game-v2/combat/attack.schema"
import type { DamageBonus } from "@workspace/game-v2/combat/damage-bonus"
import {
  foldDamageBonuses,
  renderFormula,
} from "@workspace/game-v2/combat/formula"
import type { ResolvedAttackRoll } from "@workspace/game-v2/combat/resolved"
import type {
  AttributeScores,
  DamageType,
  SideEffectKey,
} from "@workspace/game-v2/kernel/vocab"
import type { SkillKind } from "@workspace/game-v2/kernel/vocab/skills"
import {
  formatSignedBonus,
  hydrateFormulaText,
} from "@workspace/game-v2/skills/formula-text"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"
import { sortSkillsByKind } from "@workspace/game-v2/skills/sort"

import {
  DAMAGE_TYPE_LABELS,
  rangeLabel,
  SKILL_KIND_LABELS,
} from "@/lib/ui/labels"

/**
 * The app-owned view-model for the Banner Skill card + its row — every string the
 * `SkillBannerCard`/`ResolvedSkillRow` render is precomputed here, so those
 * components stay layout-only and blind to the engine. This is the shape seam
 * (UNN-583) counterpart of the vocab-type seam: the engine's `ResolvedSkill` and
 * its formula functions live behind this one builder, never in `components/**`.
 */

/** The element tone/glyph key a Skill reads by — its damage type when it deals
 *  typed damage, else its intent kind. The `element-tokens` component maps this to
 *  Tailwind classes + a glyph. */
export type ElementKey =
  | DamageType
  | "special"
  | "ailment"
  | "passive"
  | "heal"
  | "support"

/** The row's leftmost chip: a tinted damage-type badge when the Skill deals typed
 *  damage, else an outline kind badge — the distinction `element`/`chipLabel`
 *  flatten away. Mirrors `RowBadgeSlot`'s prop union. */
export type SkillCardBadge =
  | { damageType: DamageType | "special"; kind?: never }
  | { damageType?: never; kind: SkillKind }

/** A resolved Side Effect tag: its canonical name + rule prose for the tooltip. */
export interface SideEffectView {
  name: string
  description: string | null
}

/** A resolved Skill cost (coin + Cost chip). App-owned peer of `ResolvedSkillCost`. */
export interface SkillCardCost {
  kind: "sp" | "hp"
  amount: number
}

/** One `label: value` meta chip (Range, Targets, Hits, Damage/Healing, Duration). */
export interface SkillCardMetaChip {
  label: string
  value: string
}

/** One Attack-Roll tier row: its band, rendered damage formula (`"—"` for an
 *  effect-only tier), and resolved side effects. */
export interface SkillCardLadderRow {
  band: string
  formula: string
  sideEffects: SideEffectView[]
}

/** The Attack-Roll damage ladder — `d20 + N` header, per-source breakdown, rows. */
export interface SkillCardLadder {
  header: string
  breakdown: string
  rows: SkillCardLadderRow[]
}

/** Everything the Banner Skill card + row render, as flat display data. */
export interface SkillCardView {
  /** The Skill's stable key — a list-render key, blind to storage/provenance. */
  key: string
  name: string
  tagline: string
  element: ElementKey
  /** The row's leftmost badge (damage-type vs. kind). */
  badge: SkillCardBadge
  /** The header chip label — damage-type word for typed damage, else the kind. */
  chipLabel: string
  /** Resolved cost (coin + Cost chip), or `null` for a free Skill. */
  cost: SkillCardCost | null
  metaChips: SkillCardMetaChip[]
  /** The damage ladder for a rolling Skill, or `null` for a non-rolling one. */
  ladder: SkillCardLadder | null
  /** The Effect-block prose (Markdown), or `null`. */
  effect: string | null
  /** Whether the Skill is castable — gates the Use button. */
  castable: boolean
}

const KIND_ELEMENT_KEY: Record<SkillKind, ElementKey> = {
  attack: "special",
  ailment: "ailment",
  passive: "passive",
  heal: "heal",
  support: "support",
}

/** The Skill's tone key: attacks by their damage type, every other kind by its
 *  own hue. Damage wins when present, so an ailment-inflicting *attack* still
 *  reads by its element. */
function elementKeyForSkill(skill: Pick<Skill, "damage" | "kind">): ElementKey {
  return skill.damage?.damageType ?? KIND_ELEMENT_KEY[skill.kind]
}

/** `Targets` renders only when the Skill hits more than one target (a single
 *  target is redundant); "Self" and party strings still show. */
function showTargets(targets: string | undefined): targets is string {
  if (!targets) return false
  return !/^1(\s|$)/.test(targets.trim())
}

function sideEffectViews(keys: readonly SideEffectKey[]): SideEffectView[] {
  return keys.flatMap((key) => {
    const sideEffect = getSideEffect(key)
    return sideEffect
      ? [{ name: sideEffect.name, description: sideEffect.description ?? null }]
      : []
  })
}

function buildMetaChips(
  skill: Skill,
  attributes: AttributeScores
): SkillCardMetaChip[] {
  const chips: SkillCardMetaChip[] = []
  if (skill.range)
    chips.push({ label: "Range", value: rangeLabel(skill.range) })
  if (showTargets(skill.targets))
    chips.push({ label: "Targets", value: skill.targets })
  if (skill.damage?.hits)
    chips.push({ label: "Hits", value: String(skill.damage.hits) })
  if (!skill.attackRoll && skill.formula)
    chips.push({
      label: skill.kind === "heal" ? "Healing" : "Damage",
      value: hydrateFormulaText(skill.formula, attributes),
    })
  if (skill.duration)
    chips.push({
      label: "Duration",
      value: `${skill.duration} ${skill.duration === 1 ? "turn" : "turns"}`,
    })
  return chips
}

function buildLadder(
  tiers: readonly AttackTier[],
  roll: ResolvedAttackRoll,
  damageBonuses: readonly DamageBonus[],
  attributes: AttributeScores
): SkillCardLadder {
  const bonusTerms = damageBonuses.map((bonus) => bonus.term)
  return {
    header: `d20 ${formatSignedBonus(roll.total).replace(" ", " ")}`,
    breakdown: roll.sources
      .map((source) => `${source.source} ${formatSignedBonus(source.amount)}`)
      .join(" · "),
    rows: tiers.map((tier) => ({
      band: tier.band,
      formula: tier.formula
        ? renderFormula(foldDamageBonuses(tier.formula, bonusTerms), attributes)
        : "—",
      sideEffects: sideEffectViews(tier.sideEffects),
    })),
  }
}

/** Folds a {@link ResolvedSkill} + the caster's attribute scores into the flat
 *  {@link SkillCardView} the card + row render. */
export function buildSkillCardView(
  resolved: ResolvedSkill,
  attributes: AttributeScores
): SkillCardView {
  const { skill, resolvedCost, resolvedAttackRoll, resolvedDamageBonuses } =
    resolved
  return {
    key: skill.key,
    name: skill.name,
    tagline: skill.tagline,
    element: elementKeyForSkill(skill),
    badge: skill.damage
      ? { damageType: skill.damage.damageType }
      : { kind: skill.kind },
    chipLabel: skill.damage
      ? DAMAGE_TYPE_LABELS[skill.damage.damageType]
      : SKILL_KIND_LABELS[skill.kind],
    cost: resolvedCost
      ? { kind: resolvedCost.kind, amount: resolvedCost.amount }
      : null,
    metaChips: buildMetaChips(skill, attributes),
    ladder:
      skill.attackRoll && resolvedAttackRoll
        ? buildLadder(
            skill.attackRoll.tiers,
            resolvedAttackRoll,
            resolvedDamageBonuses,
            attributes
          )
        : null,
    effect: skill.effect ?? null,
    castable: skill.cost !== undefined,
  }
}

/** Sorts a resolved-Skill collection by kind (the castable-grid order) and folds
 *  each into a {@link SkillCardView} — the shared Skill grid's one builder. */
export function buildSkillCardViews(
  skills: readonly ResolvedSkill[],
  attributes: AttributeScores
): SkillCardView[] {
  return sortSkillsByKind(skills).map((skill) =>
    buildSkillCardView(skill, attributes)
  )
}
