import { z } from "zod/v4"

import {
  ailmentsSchema,
  BATTLE_CONDITION_FLAG_KEYS,
  BATTLE_CONDITION_STATES,
  battleConditionsSchema,
} from "@workspace/game/foundation"

import type { CombatStatePersistenceError } from "@/lib/db/writes/combat-state"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the owner-mode Combat State editors (PRD §6.1, UNN-226).
 * Every action targets the `vitalsVersion` write class — the same token
 * adjust-pools / rest / cast already bump — so the optimistic frame stays
 * coherent across the whole Combat tab.
 *
 * `ailments` reuses {@link ailmentsSchema}'s permissive `string[]` shape: the
 * server stores whatever the player records and leaves "one at a time +
 * Downed coexists" to the picker UI, matching the column's design intent.
 */

export const SetAilmentsSchema = characterMutationBase.extend({
  ailments: ailmentsSchema,
})
export type SetAilmentsInput = z.input<typeof SetAilmentsSchema>

export const SetBattleConditionsSchema = characterMutationBase.extend({
  conditions: battleConditionsSchema,
})
export type SetBattleConditionsInput = z.input<typeof SetBattleConditionsSchema>

/**
 * Granular per-axis patch (Attack / Defense / Hit-Evasion). Avoids the
 * client building the full {@link battleConditionsSchema} object from
 * possibly-stale optimistic state when only one axis changes — the server
 * reads the current row and merges.
 */
export const SetBattleConditionAxisSchema = characterMutationBase.extend({
  axis: z.enum(["attack", "defense", "hitEvasion"]),
  state: z.enum(BATTLE_CONDITION_STATES),
})
export type SetBattleConditionAxisInput = z.input<
  typeof SetBattleConditionAxisSchema
>

/** Granular flag patch (Charged / Concentrating). Same rationale as the axis patch. */
export const SetBattleConditionFlagSchema = characterMutationBase.extend({
  flag: z.enum(BATTLE_CONDITION_FLAG_KEYS),
  value: z.boolean(),
})
export type SetBattleConditionFlagInput = z.input<
  typeof SetBattleConditionFlagSchema
>

export const AdjustExhaustionSchema = characterMutationBase.extend({
  direction: z.enum(["increment", "decrement"]),
})
export type AdjustExhaustionInput = z.input<typeof AdjustExhaustionSchema>

export const ClearCombatStateSchema = characterMutationBase
export type ClearCombatStateInput = z.input<typeof ClearCombatStateSchema>

export type CombatStateActionError =
  | "invalid-input"
  | CombatStatePersistenceError
