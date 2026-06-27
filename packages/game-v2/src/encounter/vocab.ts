/**
 * Encounter-internal fixed vocabulary, re-declared in v2 (D32). Unlike
 * {@link import("@workspace/game-v2/kernel/vocab/combat").CombatSide} (shared with
 * `visibility/`, so it lives in `kernel/vocab`), these keys are read only inside
 * the `encounter/` overlay components — so they are co-located here rather than
 * promoted to the kernel. Zod-free constants; the overlay schemas
 * ({@link import("./overlay")}) build their `z.enum`s from these arrays so a key
 * can never drift between the vocabulary and the schema.
 */

/**
 * The 12 Ailments (rulebook). The app is **permissive** — it never caps the
 * count nor enforces "one non-Downed at a time" (that is the DM's table call);
 * `downed` is the only Ailment that coexists with another, cleared at turn start
 * when a combatant is drafted.
 */
export const AILMENT_KEYS = [
  "downed",
  "burn",
  "freeze",
  "shock",
  "dizzy",
  "forget",
  "sleep",
  "confuse",
  "fear",
  "despair",
  "rage",
  "brainwash",
] as const

export type AilmentKey = (typeof AILMENT_KEYS)[number]

/**
 * The named, stacking **counters** a DM keeps on a combatant (rulebook
 * Mechanics): `lumina` (Healer/Warlock's Path of Dawn — an enemy struck by Light
 * is Illuminated) and `tells` (Thief's Insight — +1 Attack Roll per Tell). Both
 * per-source caps are unenforced; adding a counter is a one-line addition here
 * plus a display label.
 */
export const COUNTER_KEYS = ["lumina", "tells"] as const

export type CounterKey = (typeof COUNTER_KEYS)[number]

/** Per-axis Battle Condition state (rulebook 3.8). */
export const BATTLE_CONDITION_STATES = [
  "neutral",
  "increased",
  "decreased",
] as const

export type BattleConditionState = (typeof BATTLE_CONDITION_STATES)[number]

/**
 * The three tri-state Battle Condition **axes** — the keys whose value is a
 * {@link BattleConditionState}. The canonical runtime vocabulary for an axis: the
 * battle-condition edit names one of these, and `ConditionDurations` keys its
 * per-combatant countdowns by them.
 */
export const BATTLE_CONDITION_AXIS_KEYS = [
  "attack",
  "defense",
  "hitEvasion",
] as const

export type BattleConditionAxisKey = (typeof BATTLE_CONDITION_AXIS_KEYS)[number]

/**
 * The two single-use Battle Condition **flags** (`charged`/`concentrating`) —
 * booleans consumed on the next attack, the complement of
 * {@link BATTLE_CONDITION_AXIS_KEYS}.
 */
export const BATTLE_CONDITION_FLAG_KEYS = ["charged", "concentrating"] as const

export type BattleConditionFlagKey = (typeof BATTLE_CONDITION_FLAG_KEYS)[number]

/**
 * The standard kaja/nda duration — every kaja/nda lasts 3 turns (rulebook 3.8).
 * The reducer falls back to this when an axis edit omits an explicit turn count.
 */
export const DEFAULT_BATTLE_CONDITION_TURNS = 3
