import type {
  Affinity,
  AffinityDamageType,
  DamageType,
} from "@/lib/game/affinity"
import type {
  ArchetypeTier,
  AttributeKey,
  Lineage,
} from "@/lib/game/archetypes/schema"
import type { Delivery, Range } from "@/lib/game/attack"
import type {
  BattleConditionState,
  PathChoice,
  VirtueKey,
} from "@/lib/game/character"
import type { BonusTargetKey } from "@/lib/game/effects"
import type { SkillKind } from "@/lib/game/skill-kind"

/**
 * Canonical display labels for the game-data vocabularies. Every UI surface
 * that needs to render an Attribute, Affinity, damage type, virtue, etc. as
 * a human-readable string imports its map from here so phrasing cannot
 * drift between sheet sections.
 */

/** Full Attribute names: `Strength`, `Magic`, `Agility`, `Luck`. */
export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  strength: "Strength",
  magic: "Magic",
  agility: "Agility",
  luck: "Luck",
}

/** Short Attribute labels for the per-Archetype mini-grid (`St`, `Ma`, …). */
export const ATTRIBUTE_SHORT_LABELS: Record<AttributeKey, string> = {
  strength: "St",
  magic: "Ma",
  agility: "Ag",
  luck: "Lu",
}

/**
 * Attribute and pool bonus targets used by item Attribute effects: the four
 * Attributes plus HP and SP.
 */
export const BONUS_TARGET_LABELS: Record<BonusTargetKey, string> = {
  hp: "HP",
  sp: "SP",
  strength: "Strength",
  magic: "Magic",
  agility: "Agility",
  luck: "Luck",
}

/**
 * Affinity word labels, including Neutral. Surfaces that never chart Neutral
 * (the Archetype chart, item effects on a single damage type) narrow the
 * key with `Exclude<Affinity, "neutral">` at the call site.
 */
export const AFFINITY_LABELS: Record<Affinity, string> = {
  weak: "Weak",
  resist: "Resist",
  null: "Null",
  repel: "Repel",
  drain: "Drain",
  neutral: "Neutral",
}

/** The eleven Affinity-charted damage types. */
export const AFFINITY_DAMAGE_TYPE_LABELS: Record<AffinityDamageType, string> = {
  slash: "Slash",
  pierce: "Pierce",
  strike: "Strike",
  fire: "Fire",
  ice: "Ice",
  wind: "Wind",
  elec: "Elec",
  aether: "Aether",
  psy: "Psy",
  light: "Light",
  dark: "Dark",
}

/**
 * Every damage type a Skill can deal, including Almighty and the schema-level
 * "special" escape hatch used by Skills whose damage type is not one of the
 * standard eleven.
 */
export const DAMAGE_TYPE_LABELS: Record<DamageType | "special", string> = {
  ...AFFINITY_DAMAGE_TYPE_LABELS,
  almighty: "Almighty",
  special: "Special",
}

/** Damage delivery: `Physical` / `Magical`. */
export const DELIVERY_LABELS: Record<Delivery, string> = {
  physical: "Physical",
  magical: "Magical",
}

/** Skill discriminator labels for the popover header badge. */
export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  attack: "Attack",
  heal: "Healing",
  support: "Support",
  passive: "Passive",
  ailment: "Ailment",
}

/** The three HP/SP paths (PRD §5.1). */
export const PATH_CHOICE_LABELS: Record<PathChoice, string> = {
  "health-focused": "Health-Focused",
  balanced: "Balanced",
  "skill-focused": "Skill-Focused",
}

/** The four Virtues. */
export const VIRTUE_LABELS: Record<VirtueKey, string> = {
  expression: "Expression",
  empathy: "Empathy",
  wisdom: "Wisdom",
  focus: "Focus",
}

/** The three allocator ranks rendered on the Virtues control. */
export const VIRTUE_RANK_LABELS: Record<0 | 1 | 2, string> = {
  0: "+0",
  1: "+1",
  2: "+2",
}

/** The twelve Lineages. */
export const LINEAGE_LABELS: Record<Lineage, string> = {
  warrior: "Warrior Lineage",
  mage: "Mage Lineage",
  brawler: "Brawler Lineage",
  knight: "Knight Lineage",
  healer: "Healer Lineage",
  thief: "Thief Lineage",
  berserker: "Berserker Lineage",
  bard: "Bard Lineage",
  shapechanger: "Shapechanger Lineage",
  hunter: "Hunter Lineage",
  warlock: "Warlock Lineage",
  summoner: "Summoner Lineage",
}

/** The four Archetype Tiers. */
export const TIER_LABELS: Record<ArchetypeTier, string> = {
  initiate: "Initiate",
  adept: "Adept",
  elite: "Elite",
  paragon: "Paragon",
}

/** Per-axis Battle Condition state for the Combat State block. */
export const BATTLE_CONDITION_LABELS: Record<BattleConditionState, string> = {
  neutral: "Neutral",
  increased: "Increased",
  decreased: "Decreased",
}

/**
 * Known range labels used in the Skill / intrinsic-attack popovers. Skills
 * with a non-canonical range carry an explicit string instead and never go
 * through this map.
 */
export const KNOWN_RANGE_LABELS: Record<Range, string> = {
  engaged: "Engaged",
  "all-engaged": "All Engaged",
  "same-zone": "Same Zone",
  "adjacent-zone": "Adjacent Zone",
  "same-or-adjacent-zone": "Same/Adjacent Zone",
  all: "All",
}
