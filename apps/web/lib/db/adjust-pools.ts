import { and, eq, sql } from "drizzle-orm"

import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
  applyUsePrisma,
  type AdjustAmountError,
  type UsePrismaError,
} from "../game/character/adjust-pools"
import { err, ok, type Result } from "../result"
import { db } from "./index"
import { characterExists, loadHydratedCharacterById } from "./load-character"
import { characters } from "./schema/character"

/**
 * Persistence for the header owner-mode pool adjustments (PRD §6.1 / §7.6):
 * hydrate the character via {@link loadHydratedCharacterById} (Heal and
 * Recover SP need the derived maxes), run the matching pure transition, then
 * write back the single pool column that changed via an UPDATE conditioned on
 * `(id, vitalsVersion)`. All five are vitals-class writes per the UNN-140
 * baseline; the same column the Cast and Rest wrappers bump.
 *
 * Mirrors the cast-skill wrapper shape exactly so the staleness contract,
 * `characterExists` disambiguation, and the version field in the success
 * payload all match what `dispatchCharacterWriteWithRetry` already expects.
 */

export type AdjustPoolPersistenceError =
  | AdjustAmountError
  | "character-not-found"
  | "stale"

export type UsePrismaPersistenceError =
  | UsePrismaError
  | "character-not-found"
  | "stale"

export interface DamagePersistenceSuccess {
  currentHP: number
  version: number
}

export interface HealPersistenceSuccess {
  currentHP: number
  version: number
}

export interface SpendSPPersistenceSuccess {
  currentSP: number
  version: number
}

export interface RecoverSPPersistenceSuccess {
  currentSP: number
  version: number
}

export interface UsePrismaPersistenceSuccess {
  prismaCharges: number
  version: number
}

export async function applyDamageForCharacter(
  characterId: string,
  amount: number,
  expectedVersion: number
): Promise<Result<DamagePersistenceSuccess, AdjustPoolPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyDamage(character, amount)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({
    currentHP: result.value.currentHP,
    version: updated[0]!.vitalsVersion,
  })
}

export async function applyHealForCharacter(
  characterId: string,
  amount: number,
  expectedVersion: number
): Promise<Result<HealPersistenceSuccess, AdjustPoolPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyHeal(character, amount)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({
    currentHP: result.value.currentHP,
    version: updated[0]!.vitalsVersion,
  })
}

export async function applySpendSPForCharacter(
  characterId: string,
  amount: number,
  expectedVersion: number
): Promise<Result<SpendSPPersistenceSuccess, AdjustPoolPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applySpendSP(character, amount)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentSP: result.value.currentSP,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({
    currentSP: result.value.currentSP,
    version: updated[0]!.vitalsVersion,
  })
}

export async function applyRecoverSPForCharacter(
  characterId: string,
  amount: number,
  expectedVersion: number
): Promise<Result<RecoverSPPersistenceSuccess, AdjustPoolPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyRecoverSP(character, amount)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentSP: result.value.currentSP,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({
    currentSP: result.value.currentSP,
    version: updated[0]!.vitalsVersion,
  })
}

export async function applyUsePrismaForCharacter(
  characterId: string,
  expectedVersion: number
): Promise<Result<UsePrismaPersistenceSuccess, UsePrismaPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyUsePrisma(character)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      prismaCharges: result.value.prismaCharges,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({
    prismaCharges: result.value.prismaCharges,
    version: updated[0]!.vitalsVersion,
  })
}
