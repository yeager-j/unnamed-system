import { eq } from "drizzle-orm"

import type { VirtueKey } from "../game/character"
import { err, type Result } from "../game/result"
import {
  addSpark,
  rankUpVirtue,
  type SparkCharacter,
  type SparkError,
} from "../game/spark"
import { db } from "./index"
import { characters } from "./schema/character"

/**
 * Persistence for the pure Spark engine: load the row, run the (pure)
 * transition, write back only on success. The four `virtue*` columns and the
 * `sparkLog` JSON column are mapped to/from the engine's storage-agnostic
 * {@link SparkCharacter} here — the one place that boundary lives. Each write
 * is a single-row `UPDATE`, so `neon-http`'s lack of interactive transactions
 * is irrelevant.
 */

/**
 * The pure engine's failures plus the one this layer adds: the id matched no
 * character. Kept off {@link SparkError} because a missing row is a
 * persistence concern the pure engine never encounters.
 */
export type SparkPersistenceError = SparkError | "character-not-found"

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
 * unwritten when the log is already full, or `character-not-found` when the
 * id matches no character.
 */
export async function addSparkForCharacter(
  characterId: string,
  virtue: VirtueKey
): Promise<Result<SparkCharacter, SparkPersistenceError>> {
  const character = await loadSparkCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = addSpark(character, virtue)
  if (!result.ok) return result

  await db
    .update(characters)
    .set({ sparkLog: result.value.sparkLog })
    .where(eq(characters.id, characterId))

  return result
}

/**
 * Resolves a Virtue rank-up and persists the incremented Rank plus the
 * cleared log in one atomic single-row update. Returns the engine's failure
 * result unwritten on any validation failure, or `character-not-found` when
 * the id matches no character.
 */
export async function rankUpVirtueForCharacter(
  characterId: string,
  virtue: VirtueKey
): Promise<Result<SparkCharacter, SparkPersistenceError>> {
  const character = await loadSparkCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = rankUpVirtue(character, virtue)
  if (!result.ok) return result

  await db
    .update(characters)
    .set({
      sparkLog: result.value.sparkLog,
      virtueExpression: result.value.virtues.expression,
      virtueEmpathy: result.value.virtues.empathy,
      virtueWisdom: result.value.virtues.wisdom,
      virtueFocus: result.value.virtues.focus,
    })
    .where(eq(characters.id, characterId))

  return result
}
