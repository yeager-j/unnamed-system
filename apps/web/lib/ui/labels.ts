import type {
  ArchetypeTier,
  AttributeKey,
  Lineage,
} from "@/lib/game/archetypes"
import {
  getTalent,
  type BattleConditionState,
  type PathChoice,
  type SuggestedPath,
  type TalentKey,
  type VirtueKey,
} from "@/lib/game/character"
import type {
  Affinity,
  AffinityDamageType,
  BonusTargetKey,
  DamageType,
  Delivery,
  Range,
} from "@/lib/game/combat"
import type { EquipSlot } from "@/lib/game/items"
import type { StainElement } from "@/lib/game/mechanics"
import type { SkillKind } from "@/lib/game/skills"
import type { ResolvedSkillCost } from "@/lib/game/skills/utils"

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

/** Singular equip-slot labels for the per-row slot badge. */
export const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
}

/**
 * Plural section headings for the Inventory list and the add-item picker,
 * grouped by capability: the three equip slots plus consumables.
 */
export const ITEM_GROUP_LABELS = {
  weapon: "Weapons",
  armor: "Armor",
  accessory: "Accessories",
  consumable: "Consumables",
} as const

/** Skill discriminator labels for the popover header badge. */
export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  attack: "Attack",
  heal: "Healing",
  support: "Support",
  passive: "Passive",
  ailment: "Ailment",
}

/** Resource a Skill cost drains, for the cost chip: `SP` / `HP`. */
export const COST_KIND_LABELS: Record<ResolvedSkillCost["kind"], string> = {
  sp: "SP",
  hp: "HP",
}

/** The three HP/SP paths (PRD §5.1). */
export const PATH_CHOICE_LABELS: Record<PathChoice, string> = {
  "health-focused": "Health-Focused",
  balanced: "Balanced",
  "skill-focused": "Skill-Focused",
}

/**
 * A Lineage's suggested Path, phrased like the {@link PATH_CHOICE_LABELS} it
 * mirrors. Drives the Atlas "Recommended Path" line ({@link LINEAGE_SUGGESTED_PATH}).
 */
export const SUGGESTED_PATH_LABELS: Record<SuggestedPath, string> = {
  health: "Health-Focused",
  balanced: "Balanced",
  skill: "Skill-Focused",
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

/** Roman-numeral tier ordinals, as the Lineage Atlas column headers show them. */
export const TIER_ROMAN_LABELS: Record<ArchetypeTier, string> = {
  initiate: "I",
  adept: "II",
  elite: "III",
  paragon: "IV",
}

/**
 * Per-tier minimum-level hint shown under each Lineage Atlas column. These are
 * the rulebook's optional level-gate thresholds (Adept 8, Elite 16, Paragon 24)
 * surfaced as informational guidance — the Atlas gates unlocks on Archetype
 * prerequisites, not level (PRD §6.1).
 */
export const TIER_LEVEL_HINT_LABELS: Record<ArchetypeTier, string> = {
  initiate: "Lv 1+",
  adept: "Lv 8+",
  elite: "Lv 16+",
  paragon: "Lv 24+",
}

/**
 * Icon keys a Lineage can display. These are resolved to a Phosphor component
 * by `LINEAGE_ICONS` in [lib/ui/lineage-icons.ts](./lineage-icons.ts) — kept as
 * plain strings here (not the component itself) so this widely-imported,
 * server-safe module never pulls in the icon library.
 */
export type LineageIconKey =
  | "sword"
  | "magic-wand"
  | "fist"
  | "shield"
  | "heart"
  | "knife"
  | "axe"
  | "music-notes"
  | "paw-print"
  | "crosshair"
  | "skull"
  | "users-three"

/**
 * Per-Lineage display definition: the bare `label` (no "Lineage" suffix — for
 * dense surfaces like the Atlas sidebar; {@link LINEAGE_LABELS} keeps the
 * suffixed form for headings), the {@link LineageIconKey}, and the flavor
 * `description` shown as the Atlas heading's subtitle. Subtitles are authored
 * by hand; an empty string renders no subtitle.
 */
export interface LineageDisplay {
  label: string
  icon: LineageIconKey
  description: string
}

export const LINEAGE_DISPLAY: Record<Lineage, LineageDisplay> = {
  warrior: { label: "Warrior", icon: "sword", description: "" },
  mage: { label: "Mage", icon: "magic-wand", description: "" },
  brawler: { label: "Brawler", icon: "fist", description: "" },
  knight: {
    label: "Knight",
    icon: "shield",
    description: "Oaths, bulwarks, and the long line.",
  },
  healer: { label: "Healer", icon: "heart", description: "" },
  thief: { label: "Thief", icon: "knife", description: "" },
  berserker: { label: "Berserker", icon: "axe", description: "" },
  bard: { label: "Bard", icon: "music-notes", description: "" },
  shapechanger: { label: "Shapechanger", icon: "paw-print", description: "" },
  hunter: { label: "Hunter", icon: "crosshair", description: "" },
  warlock: { label: "Warlock", icon: "skull", description: "" },
  summoner: { label: "Summoner", icon: "users-three", description: "" },
}

/** Per-axis Battle Condition state for the Combat State block. */
export const BATTLE_CONDITION_LABELS: Record<BattleConditionState, string> = {
  neutral: "Neutral",
  increased: "Increased",
  decreased: "Decreased",
}

/** The three tri-state Battle Condition axes (Attack / Defense / Hit-Evasion). */
export const BATTLE_CONDITION_AXIS_LABELS = {
  attack: "Attack",
  defense: "Defense",
  hitEvasion: "Hit/Evasion",
} as const

/** The two single-use Battle Condition flags (Charged / Concentrating). */
export const BATTLE_CONDITION_FLAG_LABELS = {
  charged: "Charged",
  concentrating: "Concentrating",
} as const

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

/** The five Stain elements the Mage can hold. */
export const STAIN_ELEMENT_LABELS: Record<StainElement, string> = {
  fire: "Fire",
  ice: "Ice",
  elec: "Elec",
  wind: "Wind",
  light: "Light",
}

/**
 * Display label for a Talent, resolved from the canonical registry; falls back
 * to the raw key if it doesn't match a shipped Talent.
 */
export const talentLabel = (key: TalentKey): string =>
  getTalent(key)?.name ?? key
