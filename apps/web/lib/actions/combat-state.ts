"use server"

import { err, type Result } from "@workspace/game/foundation/result"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyAdjustExhaustionForCharacter,
  applyClearCombatStateForCharacter,
  applySetAilmentsForCharacter,
  applySetBattleConditionAxisForCharacter,
  applySetBattleConditionFlagForCharacter,
  applySetBattleConditionsForCharacter,
  type AdjustExhaustionSuccess,
  type ClearCombatStateSuccess,
  type SetAilmentsSuccess,
  type SetBattleConditionsSuccess,
} from "@/lib/db/writes/combat-state"

import {
  AdjustExhaustionSchema,
  ClearCombatStateSchema,
  SetAilmentsSchema,
  SetBattleConditionAxisSchema,
  SetBattleConditionFlagSchema,
  SetBattleConditionsSchema,
  type AdjustExhaustionInput,
  type ClearCombatStateInput,
  type CombatStateActionError,
  type SetAilmentsInput,
  type SetBattleConditionAxisInput,
  type SetBattleConditionFlagInput,
  type SetBattleConditionsInput,
} from "./combat-state.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Actions for owner-mode Combat State editing (PRD §6.1, UNN-226).
 * Each wraps the matching `lib/db/writes/combat-state` primitive: parse the input,
 * `requireOwner` (non-owners get HTTP 403), apply the write, then
 * {@link revalidateCharacter} so the sheet's derived state re-renders.
 */

export async function setAilmentsAction(
  input: SetAilmentsInput
): Promise<Result<SetAilmentsSuccess, CombatStateActionError>> {
  const parsed = SetAilmentsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applySetAilmentsForCharacter(
    character.id,
    parsed.data.ailments,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function setBattleConditionsAction(
  input: SetBattleConditionsInput
): Promise<Result<SetBattleConditionsSuccess, CombatStateActionError>> {
  const parsed = SetBattleConditionsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applySetBattleConditionsForCharacter(
    character.id,
    parsed.data.conditions,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function setBattleConditionAxisAction(
  input: SetBattleConditionAxisInput
): Promise<Result<SetBattleConditionsSuccess, CombatStateActionError>> {
  const parsed = SetBattleConditionAxisSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applySetBattleConditionAxisForCharacter(
    character.id,
    parsed.data.axis,
    parsed.data.state,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function setBattleConditionFlagAction(
  input: SetBattleConditionFlagInput
): Promise<Result<SetBattleConditionsSuccess, CombatStateActionError>> {
  const parsed = SetBattleConditionFlagSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applySetBattleConditionFlagForCharacter(
    character.id,
    parsed.data.flag,
    parsed.data.value,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function adjustExhaustionAction(
  input: AdjustExhaustionInput
): Promise<Result<AdjustExhaustionSuccess, CombatStateActionError>> {
  const parsed = AdjustExhaustionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyAdjustExhaustionForCharacter(
    character.id,
    parsed.data.direction,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function clearCombatStateAction(
  input: ClearCombatStateInput
): Promise<Result<ClearCombatStateSuccess, CombatStateActionError>> {
  const parsed = ClearCombatStateSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyClearCombatStateForCharacter(
    character.id,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
