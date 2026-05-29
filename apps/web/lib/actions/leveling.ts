"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyLevelUpForCharacter,
  awardVictoriesForCharacter,
  type AwardVictoriesPersistenceSuccess,
  type LevelUpPersistenceSuccess,
} from "@/lib/db/writes/leveling"
import { err, type Result } from "@/lib/result"

import {
  AwardVictoriesSchema,
  LevelUpSchema,
  type AwardVictoriesActionError,
  type AwardVictoriesInput,
  type LevelUpActionError,
  type LevelUpInput,
} from "./leveling.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Actions for the header owner-mode progression controls (PRD §6.1 /
 * §7.4, UNN-157). `awardVictoriesAction` wraps the progression-class
 * `awardVictoriesForCharacter` primitive (Standard / Heroic / Undo);
 * `levelUpAction` wraps the cross-class `applyLevelUpForCharacter` primitive,
 * the codebase's only joint progression + vitals write. Auth is
 * `requireOwner` — non-owners get `forbidden()`. After a successful write,
 * `revalidateCharacter` re-derives every dependent display value (header
 * Level/Victories line, Vitals bars, Dice readouts, Saved Archetype Ranks).
 */

export async function awardVictoriesAction(
  input: AwardVictoriesInput
): Promise<
  Result<AwardVictoriesPersistenceSuccess, AwardVictoriesActionError>
> {
  const parsed = AwardVictoriesSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await awardVictoriesForCharacter(
    character.id,
    parsed.data.amount,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function levelUpAction(
  input: LevelUpInput
): Promise<Result<LevelUpPersistenceSuccess, LevelUpActionError>> {
  const parsed = LevelUpSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyLevelUpForCharacter(
    character.id,
    parsed.data.expectedVersions
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
