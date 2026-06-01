import { and, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import { characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"
import {
  DEFAULT_BATTLE_CONDITIONS,
  type Ailments,
  type BattleConditions,
  type BattleConditionState,
} from "@/lib/game/character/state"
import { MAX_EXHAUSTION_LEVEL } from "@/lib/game/combat/exhaustion"
import { err, ok, type Result } from "@/lib/result"

import {
  bumpCharacterVersionGuarded,
  characterVersionIncrement,
  staleOrMissing,
} from "./version-guard"

/**
 * Persistence for the owner-mode Combat State editors (PRD §6.1, UNN-226):
 * four vitals-class wrappers that mutate the tracked combat columns
 * (`ailments`, `battleConditions`, `exhaustion`) while honouring the same
 * `(id, vitalsVersion)` optimistic concurrency contract as
 * `lib/db/writes/adjust-pools.ts`. The Combat State edit surface shares
 * `vitalsVersion` with HP/SP/Prisma/Rest because all of these are encounter-
 * time touches by the same player on the same card — collisions between them
 * are the only thing the per-class token is meant to detect.
 */

export type CombatStatePersistenceError = "character-not-found" | "stale"

export interface CombatStatePersistenceSuccess<T> {
  value: T
  version: number
}

export type SetAilmentsSuccess = CombatStatePersistenceSuccess<Ailments>

export type SetBattleConditionsSuccess =
  CombatStatePersistenceSuccess<BattleConditions>

export type AdjustExhaustionSuccess = CombatStatePersistenceSuccess<number>

export interface ClearCombatStateSuccessValue {
  ailments: Ailments
  battleConditions: BattleConditions
}

export type ClearCombatStateSuccess =
  CombatStatePersistenceSuccess<ClearCombatStateSuccessValue>

export async function applySetAilmentsForCharacter(
  characterId: string,
  ailments: Ailments,
  expectedVersion: number
): Promise<Result<SetAilmentsSuccess, CombatStatePersistenceError>> {
  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.ailments,
    expectedVersion,
    { ailments }
  )
  if (!bumped.ok) return bumped

  return ok({ value: ailments, version: bumped.value.version })
}

/**
 * Reads the row's current `battleConditions`, falling back to the all-neutral
 * default when null, so a granular patch can merge into a known baseline.
 */
async function readBattleConditions(
  characterId: string
): Promise<BattleConditions | null> {
  const row = await loadCharacterRowById(characterId)
  if (!row) return null
  return row.battleConditions ?? DEFAULT_BATTLE_CONDITIONS
}

export async function applySetBattleConditionAxisForCharacter(
  characterId: string,
  axis: "attack" | "defense" | "hitEvasion",
  state: BattleConditionState,
  expectedVersion: number
): Promise<Result<SetBattleConditionsSuccess, CombatStatePersistenceError>> {
  const current = await readBattleConditions(characterId)
  if (!current) return err("character-not-found")
  const next: BattleConditions = { ...current, [axis]: state }
  return applySetBattleConditionsForCharacter(
    characterId,
    next,
    expectedVersion
  )
}

export async function applySetBattleConditionFlagForCharacter(
  characterId: string,
  flag: "charged" | "concentrating",
  value: boolean,
  expectedVersion: number
): Promise<Result<SetBattleConditionsSuccess, CombatStatePersistenceError>> {
  const current = await readBattleConditions(characterId)
  if (!current) return err("character-not-found")
  const next: BattleConditions = { ...current, [flag]: value }
  return applySetBattleConditionsForCharacter(
    characterId,
    next,
    expectedVersion
  )
}

export async function applySetBattleConditionsForCharacter(
  characterId: string,
  conditions: BattleConditions,
  expectedVersion: number
): Promise<Result<SetBattleConditionsSuccess, CombatStatePersistenceError>> {
  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.battleConditions,
    expectedVersion,
    { battleConditions: conditions }
  )
  if (!bumped.ok) return bumped

  return ok({ value: conditions, version: bumped.value.version })
}

/**
 * Bumps Exhaustion by +/- 1 and clamps to the `[0, MAX_EXHAUSTION_LEVEL]`
 * range. The clamp belongs on the server (not just the disabled `-` button)
 * because the action is the source of truth; the UI gate is a courtesy.
 */
export async function applyAdjustExhaustionForCharacter(
  characterId: string,
  direction: "increment" | "decrement",
  expectedVersion: number
): Promise<Result<AdjustExhaustionSuccess, CombatStatePersistenceError>> {
  const nextExpression =
    direction === "increment"
      ? sql`LEAST(${MAX_EXHAUSTION_LEVEL}, ${characters.exhaustion} + 1)`
      : sql`GREATEST(0, ${characters.exhaustion} - 1)`

  const updated = await db
    .update(characters)
    .set({
      exhaustion: nextExpression,
      ...characterVersionIncrement(EDIT_SURFACE_CLASS.exhaustion),
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({
      exhaustion: characters.exhaustion,
      vitalsVersion: characters.vitalsVersion,
    })

  if (updated.length === 0) return staleOrMissing(db, characterId)

  return ok({
    value: updated[0]!.exhaustion,
    version: updated[0]!.vitalsVersion,
  })
}

/**
 * Resets Ailments and Battle Conditions back to their neutral defaults.
 * Exhaustion is **not** touched — it's dungeoneering state that only Full
 * Rest reduces (PRD §3.7 / UNN-156). The clear is a single write so the
 * version bumps once and the optimistic client can sync in one round-trip.
 */
export async function applyClearCombatStateForCharacter(
  characterId: string,
  expectedVersion: number
): Promise<Result<ClearCombatStateSuccess, CombatStatePersistenceError>> {
  const clearedAilments: Ailments = []
  const clearedConditions = DEFAULT_BATTLE_CONDITIONS

  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.clearCombatState,
    expectedVersion,
    {
      ailments: clearedAilments,
      battleConditions: clearedConditions,
    }
  )
  if (!bumped.ok) return bumped

  return ok({
    value: {
      ailments: clearedAilments,
      battleConditions: clearedConditions,
    },
    version: bumped.value.version,
  })
}
