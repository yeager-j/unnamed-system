"use server"

import { err, type Result } from "@workspace/game/foundation/result"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addSparkForCharacter,
  rankUpVirtueForCharacter,
  type SparkPersistenceSuccess,
} from "@/lib/db/writes/spark"

import {
  AddSparkSchema,
  RankUpVirtueSchema,
  type AddSparkInput,
  type RankUpVirtueInput,
  type SparkActionError,
} from "./character-spark.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Actions for the Explore-tab Spark / Virtue rank-up controls
 * (PRD §6.1 / §7.5, UNN-222). Both wrap the progression-class persistence
 * primitives in `lib/db/writes/spark.ts`; engine validity (log full, virtue not in
 * log, rank capped) bubbles up unchanged so the client can render the right
 * toast. Auth is `requireOwner` — non-owners get `forbidden()`.
 */

export async function addSparkAction(
  input: AddSparkInput
): Promise<Result<SparkPersistenceSuccess, SparkActionError>> {
  const parsed = AddSparkSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await addSparkForCharacter(
    character.id,
    parsed.data.virtue,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function rankUpVirtueAction(
  input: RankUpVirtueInput
): Promise<Result<SparkPersistenceSuccess, SparkActionError>> {
  const parsed = RankUpVirtueSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await rankUpVirtueForCharacter(
    character.id,
    parsed.data.virtue,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
