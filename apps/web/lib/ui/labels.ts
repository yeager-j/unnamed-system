import type {
  ArchetypeTier,
  RecommendationReason,
} from "@workspace/game-v2/archetypes"
import type { EnemyFamily } from "@workspace/game-v2/catalog/enemies"
import type {
  BattleConditionState,
  CounterKey,
} from "@workspace/game-v2/encounter"
import type { EquipSlot } from "@workspace/game-v2/items"
import type {
  Affinity,
  AffinityDamageType,
  AttributeKey,
  DamageType,
  Lineage,
  PathChoice,
  Range,
  SkillKind,
  SuggestedPath,
  VirtueKey,
} from "@workspace/game-v2/kernel/vocab"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { ResolvedSkillCost } from "@workspace/game-v2/skills/skill.schema"
import type { DungeonReminder } from "@workspace/game-v2/spatial"
import { getTalent, type TalentKey } from "@workspace/game-v2/talents"

import type { DungeonStatus } from "@/lib/db/schema/dungeon"
import type { EncounterStatus } from "@/lib/db/schema/encounter"

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
  soul: "Soul",
  mind: "Mind",
  light: "Light",
  dark: "Dark",
}

/** Catalog enemy family names (the 5e creature types), for the bestiary browse
 *  table's column, filter chips, and statblock tag. */
export const ENEMY_FAMILY_LABELS: Record<EnemyFamily, string> = {
  humanoid: "Humanoid",
  beast: "Beast",
  undead: "Undead",
  aberration: "Aberration",
  monstrosity: "Monstrosity",
  elemental: "Elemental",
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

/** Singular per-row category labels for the Inventory table's badge —
 *  {@link SLOT_LABELS} widened with the non-equippable group. */
export const ITEM_CATEGORY_LABELS = {
  ...SLOT_LABELS,
  consumable: "Consumable",
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

/**
 * Icon keys a recommendation reason can display, resolved to a Phosphor
 * component by `RECOMMENDATION_REASON_ICONS` in
 * [lib/ui/recommendation-reason-icons.ts](./recommendation-reason-icons.ts) —
 * kept as plain strings here for the same server-safe reason as
 * {@link LineageIconKey}.
 */
export type RecommendationReasonIconKey =
  | "compass"
  | "lock-key-open"
  | "path"
  | "sparkle"

export interface RecommendationReasonDisplay {
  label: string
  icon: RecommendationReasonIconKey
}

/**
 * Per-reason label + icon key for the Atlas recommendation slots (UNN-256).
 * The reason is computed in the game layer ({@link RecommendationReason}); this
 * is the one place its phrasing and icon are chosen.
 */
export const RECOMMENDATION_REASON_DISPLAY: Record<
  RecommendationReason,
  RecommendationReasonDisplay
> = {
  "origin-lineage": { label: "Origin Lineage", icon: "compass" },
  "unlocked-archetype": { label: "Unlocked", icon: "lock-key-open" },
  "fits-path": { label: "Fits Your Path", icon: "path" },
  "new-damage-type": { label: "New Damage Type", icon: "sparkle" },
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

/** Display names for the named combat counters (Lumina, Tells, …). */
export const COUNTER_LABELS: Record<CounterKey, string> = {
  lumina: "Lumina",
  tells: "Tells",
}

/** The status a combatant gains while it holds any of a counter — shown on the
 *  rail + player watch (e.g. Lumina ⇒ "Illuminated", Tells ⇒ "Tells"). */
export const COUNTER_STATUS_LABELS: Record<CounterKey, string> = {
  lumina: "Illuminated",
  tells: "Tells",
}

/** One-line hint shown in the drawer's "Add counter" popover — what the counter
 *  is and the (unenforced) cap. */
export const COUNTER_HINTS: Record<CounterKey, string> = {
  lumina:
    "Illuminated by Path of Dawn. Max equals the caster's Luck (not enforced).",
  tells:
    "Learned by Thief's Insight (+1 Attack Roll each). Max per enemy equals the Thief's Archetype Rank (not enforced).",
}

/** The three per-turn actions the (non-enforcing) action economy tracks in the
 *  combatant drawer (UNN-310). */
export const ACTION_ECONOMY_LABELS = {
  move: "Move",
  standard: "Standard",
  reaction: "Reaction",
} as const

/** The two combat sides a combatant can be assigned to (UNN-300). */
export const COMBAT_SIDE_LABELS: Record<CombatSide, string> = {
  players: "Players",
  enemies: "Enemies",
}

/** A combatant's engagement status, shown on the setup placement row (UNN-301). */
export const ENGAGEMENT_STATUS_LABELS: Record<Engagement["status"], string> = {
  free: "Free",
  engaged: "Engaged",
}

/**
 * The opening-advantage chip in the live console header (UNN-344), phrased as a
 * "start": who, if anyone, got the jump (UNN-303). `neutral` is the standard
 * alternating order.
 */
export const COMBAT_ADVANTAGE_START_LABELS: Record<CombatAdvantage, string> = {
  players: "Player start",
  enemies: "Enemy start",
  neutral: "Neutral start",
}

/**
 * The opening-advantage options the DM picks in the start-combat dialog
 * (UNN-303 / rulebook 3.2). An ambush has one side take its whole opening round
 * before the other acts; `neutral` is the standard alternating order.
 */
export const COMBAT_ADVANTAGE_SETUP_LABELS: Record<CombatAdvantage, string> = {
  players: "Players ambush",
  neutral: "Neutral",
  enemies: "Enemies ambush",
}

/** Heading for the opening-advantage picker rendered as a segmented control. */
export const COMBAT_AMBUSH_HEADING = "Who ambushes?"

/** The same options as a segmented control, where the group's own label carries
 *  the noun and each item only names the side that gets the jump. */
export const COMBAT_ADVANTAGE_COMPACT_LABELS: Record<CombatAdvantage, string> =
  {
    players: "Players",
    neutral: "Neither",
    enemies: "Enemies",
  }

export const COMBAT_ADVANTAGE_SETUP_HINTS: Record<CombatAdvantage, string> = {
  players: "Players take all their opening turns before the enemies act.",
  neutral: "Standard alternating order — the highest-Agility side leads.",
  enemies: "Enemies take all their opening turns before the players act.",
}

/** Heading for the neutral-start first-side picker, and the copy shown when the
 *  two sides tie on Agility *and* Luck (the rulebook's DM-d20 case). */
export const COMBAT_FIRST_SIDE_HEADING = "Who acts first?"
export const COMBAT_FIRST_SIDE_TIE_HINT = "Tied — your call."

/**
 * The live console's *Now acting* subtitle, keyed to the acting side (UNN-344):
 * the turn belongs to the table, and the DM ends it when they're done.
 */
export const COMBAT_TURN_SUBTITLES: Record<CombatSide, string> = {
  players: "Player's turn · end it when the table's done.",
  enemies: "Enemy's turn · end it when the table's done.",
}

/** The draft-phase heading, keyed to the side drafting next (UNN-344). */
export const COMBAT_DRAFT_HEADINGS: Record<CombatSide, string> = {
  players: "Players' draft",
  enemies: "Enemies' draft",
}

/** The draft-phase subtitle — the drafting is the table's call, the tap is the
 *  DM's (UNN-344). Side-agnostic, as the design frames show. */
export const COMBAT_DRAFT_SUBTITLE =
  "Tap a glowing combatant — players' call, your tap."

/**
 * The end-of-turn review copy (UNN-317), shown in the modal after "End turn".
 * `savingThrowPrompt` phrases the per-ailment saving throw the DM rolls in the
 * real world (`1d20 + Lu`, success over 10); `CLEAR_TOOLTIP` reminds them the
 * damage tick lands *before* the save clears the ailment.
 */
export function savingThrowPrompt(ailmentName: string): string {
  return `Roll 1d20 + ${ATTRIBUTE_SHORT_LABELS.luck} > 10 for ${ailmentName}`
}

export const END_OF_TURN_CLEAR_TOOLTIP =
  "Apply this turn's tick before clearing — the saving throw is rolled after the end-of-turn damage."

export const END_OF_TURN_EMPTY = "Nothing to resolve."

/** The end-of-turn Apply button label for an enemy HP delta (UNN-317). */
export function endOfTurnApplyLabel(delta: number): string {
  return `Apply ${delta > 0 ? "+" : "−"}${Math.abs(delta)} HP`
}

/**
 * The Frenzy end-of-turn reminder for a Berserker in Frenzy Mode: the DM
 * decrements their Pain by 1 (Frenzy exits at 0, rulebook `Frenzy.md`). The
 * Berserker's player owns the write, so this only *reminds*. `pain` is the
 * value before the decrement.
 */
export function frenzyDecrementReminder(pain: number): string {
  const next = Math.max(0, pain - 1)
  const exit = next === 0 ? " — Frenzy ends" : ""
  return `Lose 1 Pain (${pain} → ${next})${exit}.`
}

export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  draft: "Draft",
  live: "Live",
  ended: "Ended",
}

/** A dungeon's lifecycle status as shown in the campaign-page dungeons list
 *  (UNN-465): the delve is being prepped, running, or wrapped. */
export const DUNGEON_STATUS_LABELS: Record<DungeonStatus, string> = {
  draft: "Draft",
  active: "Active",
  done: "Done",
}

/**
 * The at-0-HP badge a combatant shows in the console (UNN-309), keyed by kind: a
 * **PC** at 0 HP is *Fallen* (skipped, recovers to 1 on victory); an **enemy** at
 * 0 is *Dead*. Derived at render from current HP — never stored.
 */
export const COMBATANT_DOWN_LABELS = {
  pc: "Fallen",
  enemy: "Dead",
} as const

/**
 * The combatant drawer footer's where-do-edits-land note, keyed by storage
 * home: a durable PC's HP/SP writes land on its character sheet, an inline
 * enemy's edits live and die with the encounter.
 */
export const COMBATANT_EDIT_SCOPE_NOTES = {
  pc: (name: string) =>
    `HP/SP changes here write ${name}'s character sheet; conditions apply to this encounter.`,
  enemy: "Edits affect this enemy in this encounter only.",
} as const

/**
 * The non-blocking end-of-combat reminder (UNN-320): Fallen PCs recover to 1 HP,
 * but the tracker never writes a character row — each player sets it on their own
 * sheet. Display-only; ending the encounter writes nothing to characters.
 */
export const FALLEN_RECOVER_REMINDER =
  "These players recover to 1 HP — set it on their own sheet:"

/**
 * Consent copy for character placement (UNN-328). Placing a character into a
 * campaign is the owner's consent to the DM's in-combat vitals writes (ADR
 * Decision 9); the dialogs state that plainly before the owner confirms.
 */
export const CHARACTER_PLACEMENT_CONSENT =
  "The DM will be able to update this character's HP and SP during combat."

export const CHARACTER_UNPLACE_CONSENT =
  "The DM will no longer be able to update this character's HP and SP."

/** Shown when a placement/move is refused because the character is a combatant in
 *  a live encounter (the UNN-330 live-lock). */
export const CHARACTER_PLACEMENT_LIVE_LOCK_ERROR =
  "Character is in an active encounter — it cannot be moved until the encounter ends."

/** Live-lock errors for the other lifecycle operations (UNN-330). */
export const CHARACTER_DELETE_LIVE_LOCK_ERROR =
  "This character is in an active encounter — it cannot be deleted until the encounter ends."

export const MEMBER_REMOVE_LIVE_LOCK_ERROR =
  "This player has a character in an active encounter — remove the combatant or end the encounter first."

export const LEAVE_CAMPAIGN_LIVE_LOCK_ERROR =
  "You have a character in an active encounter — you can't leave until the encounter ends."

export const CAMPAIGN_DELETE_LIVE_ENCOUNTER_ERROR =
  "End the live encounter before deleting this campaign."

/** Move-confirmation copy; `{campaign}` is the character's current campaign. */
export const characterMoveConsent = (fromCampaign: string): string =>
  `This character is currently in ${fromCampaign}. Moving it here gives this campaign's DM combat access to its HP and SP, and removes ${fromCampaign}'s DM access.`

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

/**
 * Title + body for the dungeon run console's DM reminder nudges (UNN-464), keyed
 * by the pure-selector {@link DungeonReminder} kind. The rail renders these; the
 * selectors decide which fire.
 */
export const DUNGEON_REMINDER_COPY: Record<
  DungeonReminder["kind"],
  { title: string; body: string }
> = {
  "random-encounter": {
    title: "Roll for a random encounter",
    body: "The party has travelled far enough — roll on your table.",
  },
  "exhaustion-onset": {
    title: "Exhaustion accrues",
    body: "Past the 48-turn day: a level of Exhaustion would accrue (tracked on the sheet).",
  },
}

/**
 * Display label for a Talent, resolved from the canonical registry; falls back
 * to the raw key if it doesn't match a shipped Talent. Accepts open strings —
 * v2 stores Talent keys unnarrowed (an Archetype grant or a persisted pick may
 * predate the canonical list).
 */
export const talentLabel = (key: TalentKey | string): string =>
  getTalent(key)?.name ?? key
