import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"

/**
 * Cheap read of the four per-write-class version tokens (UNN-140) for the
 * character with `characterId`. Used by the silent-retry path in the client
 * write primitives: when a wrapper returns `"stale"`, the client refetches
 * the fresh token for the affected class and re-dispatches the save once
 * before surfacing an error.
 */

export interface CharacterVersions {
  identityVersion: number
  vitalsVersion: number
  inventoryVersion: number
  progressionVersion: number
}

export async function loadCharacterVersions(
  characterId: string
): Promise<CharacterVersions | null> {
  const [row] = await db
    .select({
      identityVersion: characters.identityVersion,
      vitalsVersion: characters.vitalsVersion,
      inventoryVersion: characters.inventoryVersion,
      progressionVersion: characters.progressionVersion,
    })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  return row ?? null
}
