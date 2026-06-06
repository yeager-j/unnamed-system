import { eq } from "drizzle-orm"

import {
  addSpark,
  rankUpVirtue,
  type SparkCharacter,
  type SparkError,
  type VirtueKey,
} from "@workspace/game/character"
import { err, ok, type Result } from "@workspace/game/foundation/result"

import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the pure Spark engine: load the row, run the (pure)
 * transition, then write back with a single-row `UPDATE` conditioned on
 * `(id, progressionVersion)` so a concurrent progression-class write
 * surfaces `"stale"` per the `lib/actions/README.md` baseline. The four
 * `virtue*` columns and the `sparkLog` JSON column are mapped to/from the
 * engine's storage-agnostic {@link SparkCharacter} here — the one place that
 * boundary lives.
 */

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces: the id matched no character, or the row's `progressionVersion`
 * no longer equals the caller's `expectedVersion` because a concurrent
 * progression-class write landed first.
 */
export type SparkPersistenceError = SparkError | "character-not-found" | "stale"

export interface SparkPersistenceSuccess {
  character: SparkCharacter
  version: number
}

async function loadSparkCharacter(
  characterId: string
): Promise<SparkCharacter | null> {
  const [row] = await db
    .select({
      sparkLog: characters.sparkLog,
      virtueExpression: characters.virtueExpression,
      virtueEmpathy: characters.virtueEmpathy,
      virtueWisdom: characters.virtueWisdom,
      virtueFocus: characters.virtueFocus,
    })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  if (!row) return null

  return {
    sparkLog: row.sparkLog,
    virtues: {
      expression: row.virtueExpression,
      empathy: row.virtueEmpathy,
      wisdom: row.virtueWisdom,
      focus: row.virtueFocus,
    },
  }
}

/**
 * Adds a Spark and persists the new log. Returns the engine's failure result
 * unwritten when the log is already full, `character-not-found` when the id
 * matches no character, or `"stale"` when a concurrent progression-class
 * write bumped `progressionVersion` past `expectedVersion`.
 */
export async function addSparkForCharacter(
  characterId: string,
  virtue: VirtueKey,
  expectedVersion: number
): Promise<Result<SparkPersistenceSuccess, SparkPersistenceError>> {
  const character = await loadSparkCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = addSpark(character, virtue)
  if (!result.ok) return result

  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.spark,
    expectedVersion,
    { sparkLog: result.value.sparkLog }
  )
  if (!bumped.ok) return bumped

  return ok({
    character: result.value,
    version: bumped.value.version,
  })
}

/**
 * Resolves a Virtue rank-up and persists the incremented Rank plus the
 * cleared log in one single-row update. Returns the engine's failure result
 * unwritten on any validation failure, `character-not-found` when the id
 * matches no character, or `"stale"` when a concurrent progression-class
 * write bumped `progressionVersion` past `expectedVersion`.
 */
export async function rankUpVirtueForCharacter(
  characterId: string,
  virtue: VirtueKey,
  expectedVersion: number
): Promise<Result<SparkPersistenceSuccess, SparkPersistenceError>> {
  const character = await loadSparkCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = rankUpVirtue(character, virtue)
  if (!result.ok) return result

  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.virtueRankUp,
    expectedVersion,
    {
      sparkLog: result.value.sparkLog,
      virtueExpression: result.value.virtues.expression,
      virtueEmpathy: result.value.virtues.empathy,
      virtueWisdom: result.value.virtues.wisdom,
      virtueFocus: result.value.virtues.focus,
    }
  )
  if (!bumped.ok) return bumped

  return ok({
    character: result.value,
    version: bumped.value.version,
  })
}
