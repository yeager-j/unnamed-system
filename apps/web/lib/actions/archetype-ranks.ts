"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  rankUpArchetype,
  unlockArchetype,
  type RankUpArchetypeSuccess,
  type UnlockArchetypeSuccess,
} from "@/lib/db/writes/archetype-ranks"

import {
  RankUpArchetypeSchema,
  UnlockArchetypeSchema,
  type RankUpArchetypeActionError,
  type RankUpArchetypeInput,
  type UnlockArchetypeActionError,
  type UnlockArchetypeInput,
} from "./archetype-ranks.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Spends one Saved Archetype Rank to unlock a new Archetype at Rank 1 (PRD
 * §6.1, UNN-239). See `lib/actions/README.md` for the canonical write pattern.
 */
export async function unlockArchetypeAction(
  input: UnlockArchetypeInput
): Promise<Result<UnlockArchetypeSuccess, UnlockArchetypeActionError>> {
  const parsed = UnlockArchetypeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await unlockArchetype(
    character.id,
    parsed.data.archetypeKey,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Spends one Saved Archetype Rank to rank up an owned Archetype by one (PRD
 * §6.1, UNN-239). Mastery at Rank 5 is derived, not written.
 */
export async function rankUpArchetypeAction(
  input: RankUpArchetypeInput
): Promise<Result<RankUpArchetypeSuccess, RankUpArchetypeActionError>> {
  const parsed = RankUpArchetypeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await rankUpArchetype(
    character.id,
    parsed.data.characterArchetypeId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
