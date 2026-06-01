import { z } from "zod/v4"

import { LINEAGES } from "./lineage"

/**
 * Character-domain vocabulary and value schemas for the structured (JSON)
 * parts of a character's persisted state. Kept out of the database schema
 * file so that module stays purely table/column definitions; the
 * `character*` tables import these for typing and Server Action validation.
 */

/**
 * The four Virtues. Separate from Attributes; used for social/exploration
 * checks and as Spark tags.
 */
export const VIRTUE_KEYS = ["expression", "empathy", "wisdom", "focus"] as const
export type VirtueKey = (typeof VIRTUE_KEYS)[number]

/**
 * HP/SP path chosen at creation. Determines starting HP/SP and the Hit/Skill
 * Die used at level-up (PRD §5.2, §7.4).
 */
export const PATH_CHOICES = [
  "health-focused",
  "balanced",
  "skill-focused",
] as const
export type PathChoice = (typeof PATH_CHOICES)[number]

/** Per-axis Battle Condition state (Attack / Defense / Hit-Evasion). */
export const BATTLE_CONDITION_STATES = [
  "neutral",
  "increased",
  "decreased",
] as const
export type BattleConditionState = (typeof BATTLE_CONDITION_STATES)[number]

/**
 * The five Battle Conditions (rulebook 3.8). Keys match the field names of
 * {@link battleConditionsSchema}, which tracks their live state on a
 * character; `attack`/`defense`/`hitEvasion` are tri-state axes,
 * `charged`/`concentrating` are single-use flags. Effect math is hardcoded in
 * game logic, not modelled as data.
 */
export const BATTLE_CONDITION_KEYS = [
  "attack",
  "defense",
  "hitEvasion",
  "charged",
  "concentrating",
] as const
export type BattleConditionKey = (typeof BATTLE_CONDITION_KEYS)[number]

/**
 * Manual, source-agnostic bonuses entered directly on the sheet (e.g. a bonus
 * granted by a Background or DM ruling). Mastery is NOT stored here — it is
 * derived from Archetype Rank at compute time and summed on top of these.
 * Sparse: absent keys mean no bonus.
 */
export const manualBonusesSchema = z.object({
  hp: z.number().int().optional(),
  sp: z.number().int().optional(),
  strength: z.number().int().optional(),
  magic: z.number().int().optional(),
  agility: z.number().int().optional(),
  luck: z.number().int().optional(),
})
export type ManualBonuses = z.infer<typeof manualBonusesSchema>

/** Ordered Spark log, each entry tagged with the Virtue that produced it. */
export const sparkLogSchema = z.array(z.enum(VIRTUE_KEYS)).max(7)
export type SparkLog = z.infer<typeof sparkLogSchema>

/**
 * Tracked (not computed) combat modifiers; wiped by "Clear combat state". Each
 * tri-state axis (`attack`/`defense`/`hitEvasion`) is its
 * {@link BattleConditionState} alone: Battle Conditions don't stack
 * constructively (rulebook 3.8), so there is nothing to track beyond the
 * current state. A re-applied buff extends its *duration*, which lives on the
 * initiative tracker's `CombatSession`, never on the character.
 */
export const battleConditionsSchema = z.object({
  attack: z.enum(BATTLE_CONDITION_STATES),
  defense: z.enum(BATTLE_CONDITION_STATES),
  hitEvasion: z.enum(BATTLE_CONDITION_STATES),
  charged: z.boolean(),
  concentrating: z.boolean(),
})
export type BattleConditions = z.infer<typeof battleConditionsSchema>

/**
 * The all-neutral state every axis falls back to when no per-axis
 * Battle Condition has been set on a character. Used as the read fallback on
 * the Combat State card and as the post-state the "Clear combat state"
 * mutator writes back.
 */
export const DEFAULT_BATTLE_CONDITIONS: BattleConditions = {
  attack: "neutral",
  defense: "neutral",
  hitEvasion: "neutral",
  charged: false,
  concentrating: false,
}

/**
 * Manual, sparse count of allied Lineages present in the current combat
 * encounter — including the character themselves. Read by the
 * `perPartyLineage` Attack Roll scaler (Magic Circle, Ailment Boost) when a
 * passive Skill needs per-party context to resolve its bonus.
 *
 * Sparse on purpose: missing keys mean "no allies of that Lineage". Player-
 * maintained today (no party tracking elsewhere in the app); the "Clear
 * combat state" mutator should reset this alongside {@link battleConditions}
 * when that mutator lands, and once an initiative tracker exists the value
 * should migrate to that authoritative source — the data shape does not need
 * to change.
 */
export const partyCompositionSchema = z.partialRecord(
  z.enum(LINEAGES),
  z.number().int().positive()
)
export type PartyComposition = z.infer<typeof partyCompositionSchema>

/**
 * Inheritance Slot configuration for one Archetype. `sourceCharacterArchetypeId`
 * points at the `characterArchetype` row the inherited Skill comes from; both
 * it and `skillKey` are null for an empty slot.
 */
export const inheritanceSlotsSchema = z.array(
  z.object({
    slotIndex: z.number().int().nonnegative(),
    sourceCharacterArchetypeId: z.string().nullable(),
    skillKey: z.string().nullable(),
  })
)
export type InheritanceSlots = z.infer<typeof inheritanceSlotsSchema>

/**
 * Active Ailments, by key. Intentionally permissive: the app stores whatever
 * Ailments the player records and neither caps the count nor enforces
 * co-existence — the "one Ailment at a time (Downed may co-exist)" rule is
 * the DM's call at the table, not the app's. The canonical 12-ailment value
 * set lives in hardcoded game data (`./ailments`, keyed by `AilmentKey`);
 * this column stays plain strings so the app never rejects a DM's call.
 */
export const ailmentsSchema = z.array(z.string())
export type Ailments = z.infer<typeof ailmentsSchema>

/** A character is Fallen when their current HP has reached or dropped below 0. */
export function isFallen(currentHP: number): boolean {
  return currentHP <= 0
}
