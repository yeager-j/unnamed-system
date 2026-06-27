import { z } from "zod/v4"

import {
  COMBAT_SIDES,
  type CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

import {
  AILMENT_KEYS,
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_STATES,
  COUNTER_KEYS,
} from "./vocab"

/**
 * The six **encounter-overlay** components (CD1, CD10; parent D21, D29) — the
 * combat-scoped state the rules clear at end of combat, which the durable entity
 * row deliberately does not carry. They are **real components** (`Allegiance`,
 * `TurnState`, `Ailments`, `BattleConditions`, `ConditionDurations`, `Counters`),
 * not one god-struct, but — being **always present** per participant (defaulted at
 * construction, R1.1) — they need no presence-guard and so live as the plain typed
 * fields of {@link OverlayComponents}, read via `participant.overlay.X`.
 *
 * They are a sibling **type grouping** rooted in `encounter/`, **never** added to
 * the kernel `ComponentRegistry` (the durable entity-row vocabulary). The typed
 * {@link OVERLAY_KEYS} drives the end-of-combat sweep; its disjointness from the
 * other two registries is proven in {@link import("./disjointness")}.
 */

/**
 * **Allegiance** — which side a participant fights for. Orthogonal to whether the
 * entity is a PC or an enemy (a charmed PC flips its `side`); drives redaction +
 * initiative.
 */
export const allegianceSchema = z.object({
  side: z.enum(COMBAT_SIDES),
})

export type Allegiance = z.infer<typeof allegianceSchema>

/**
 * **TurnState** — the action economy as pure **consumption** (CD10; D21),
 * superseding v1's `moveAvailable`/`standardAvailable`/`reactionAvailable`
 * booleans **and** `hasActedThisRound`. `available = budget − used` is computed in
 * an advisory selector against the constant 1/1/1 base (no stored budget snapshot).
 * The acted-flag is **derived** (`turnsTakenThisRound > 0`), never stored —
 * `turnsTakenThisRound` is also the boss-multi-turn substrate.
 */
export const turnStateSchema = z.object({
  movesUsed: z.number().int().nonnegative(),
  standardsUsed: z.number().int().nonnegative(),
  reactionsUsed: z.number().int().nonnegative(),
  turnsTakenThisRound: z.number().int().nonnegative(),
})

export type TurnState = z.infer<typeof turnStateSchema>

/** The fresh, no-action-consumed `TurnState` (the not-yet-acted default). */
export const DEFAULT_TURN_STATE: TurnState = {
  movesUsed: 0,
  standardsUsed: 0,
  reactionsUsed: 0,
  turnsTakenThisRound: 0,
}

/**
 * **Ailments** — the participant's active Ailments, an ordered list of
 * {@link AILMENT_KEYS}. Idempotent + permissive at the reducer (the app never caps
 * the count); `downed` may coexist with one other Ailment.
 */
export const ailmentsSchema = z.array(z.enum(AILMENT_KEYS))

export type Ailments = z.infer<typeof ailmentsSchema>

/**
 * **BattleConditions** — the three tri-state axes (Attack/Defense/Hit-Evasion)
 * plus the two single-use flags (Charged/Concentrating), rulebook 3.8. Conditions
 * don't stack, so each axis is its state alone; *how long* an axis lasts lives in
 * the sibling {@link ConditionDurations}.
 */
export const battleConditionsSchema = z.object({
  attack: z.enum(BATTLE_CONDITION_STATES),
  defense: z.enum(BATTLE_CONDITION_STATES),
  hitEvasion: z.enum(BATTLE_CONDITION_STATES),
  charged: z.boolean(),
  concentrating: z.boolean(),
})

export type BattleConditions = z.infer<typeof battleConditionsSchema>

/** The all-neutral, no-flags state a fresh participant starts in (R1.1). */
export const DEFAULT_BATTLE_CONDITIONS: BattleConditions = {
  attack: "neutral",
  defense: "neutral",
  hitEvasion: "neutral",
  charged: false,
  concentrating: false,
}

/**
 * **ConditionDurations** — per-axis Battle Condition countdowns (turns
 * remaining), sparse and positive-only: an absent axis means no active duration.
 * When a countdown reaches zero the reducer drops the key and resets the axis to
 * `neutral`. Charged/Concentrating are flags with no duration.
 */
export const conditionDurationsSchema = z
  .partialRecord(
    z.enum(BATTLE_CONDITION_AXIS_KEYS),
    z.number().int().positive()
  )
  .default({})

export type ConditionDurations = z.infer<typeof conditionDurationsSchema>

/**
 * **Counters** — named stacking tallies (`lumina`/`tells`), a sparse
 * `key → positive count` map (absent key ⇒ 0). Signed-delta at the reducer with a
 * floor of 0; a counter driven to 0 **deletes** its key.
 */
export const countersSchema = z
  .partialRecord(z.enum(COUNTER_KEYS), z.number().int().positive())
  .default({})

export type Counters = z.infer<typeof countersSchema>

/**
 * The always-present overlay bundle homed on every {@link
 * import("./session").Participant}. A plain struct (CD1's F4 revision), read via
 * `participant.overlay.X` — not a sparse `Partial<>`, so no guards.
 */
export const overlayComponentsSchema = z.object({
  allegiance: allegianceSchema,
  turnState: turnStateSchema,
  ailments: ailmentsSchema,
  battleConditions: battleConditionsSchema,
  conditionDurations: conditionDurationsSchema,
  counters: countersSchema,
})

export type OverlayComponents = z.infer<typeof overlayComponentsSchema>

/**
 * The overlay component keys, the single source the end-of-combat sweep keys on
 * (§2.8). `as const satisfies` proves every entry is a real overlay key at build
 * time; {@link import("./disjointness")} proves the array is **complete** (so the
 * sweep is total) and disjoint from the instance + kernel registries.
 */
export const OVERLAY_KEYS = [
  "allegiance",
  "turnState",
  "ailments",
  "battleConditions",
  "conditionDurations",
  "counters",
] as const satisfies readonly (keyof OverlayComponents)[]

/**
 * Builds the fresh overlay bundle a participant starts an encounter with (R1.1):
 * no ailments, all battle conditions neutral, every action available
 * (consumption 0), no condition durations, no counters. `hasActed` maps to the
 * derived acted-flag — `turnsTakenThisRound = hasActed ? 1 : 0` (CD10): `false`
 * for a combatant present at setup, `true` for a mid-round joiner (queued for the
 * next round).
 */
export function defaultOverlay({
  side,
  hasActed = false,
}: {
  side: CombatSide
  hasActed?: boolean
}): OverlayComponents {
  return {
    allegiance: { side },
    turnState: { ...DEFAULT_TURN_STATE, turnsTakenThisRound: hasActed ? 1 : 0 },
    ailments: [],
    battleConditions: { ...DEFAULT_BATTLE_CONDITIONS },
    conditionDurations: {},
    counters: {},
  }
}
