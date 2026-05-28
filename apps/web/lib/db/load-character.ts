import { asc, eq } from "drizzle-orm"

import {
  deriveHydratedCharacter,
  type HydratedCharacter,
  type RawCharacterInputs,
} from "../game/character"
import { db } from "./index"
import {
  characterArchetypes,
  characterChains,
  characterKnives,
  characters,
  inventoryItems,
} from "./schema/character"

/**
 * The full character-sheet loader. It owns the character query (by `id` or
 * public `shortId`) and every child-row query ({@link fetchRawInputs}); the
 * pure {@link deriveHydratedCharacter} (in `lib/game/`) turns those raw rows
 * into the sheet view. Splitting fetch from derive lets the client re-derive
 * an optimistic frame with the exact function the server uses. Nothing here
 * imports another db domain.
 *
 * The view types ({@link HydratedCharacter} and friends) live in
 * `lib/game/hydrated-character.ts` so game-layer code can consume them
 * without crossing into persistence; the assembly stays here.
 */

/** Row shapes inferred from the Drizzle schema. The Hydrated* view types
 *  reference these via type-only imports from `lib/game/`. */
export type CharacterRow = typeof characters.$inferSelect
export type CharacterArchetypeRow = typeof characterArchetypes.$inferSelect
export type CharacterKnifeRow = typeof characterKnives.$inferSelect
export type CharacterChainRow = typeof characterChains.$inferSelect
export type InventoryItemRow = typeof inventoryItems.$inferSelect

/**
 * Fetches the persisted {@link RawCharacterInputs} for a character row — the
 * four child-row queries, run concurrently. The pure
 * {@link deriveHydratedCharacter} turns the result into the sheet view.
 */
async function fetchRawInputs(row: CharacterRow): Promise<RawCharacterInputs> {
  const [archetypeRows, inventoryRows, knives, chains] = await Promise.all([
    db
      .select()
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, row.id)),
    db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, row.id)),
    db
      .select()
      .from(characterKnives)
      .where(eq(characterKnives.characterId, row.id))
      .orderBy(asc(characterKnives.order)),
    db
      .select()
      .from(characterChains)
      .where(eq(characterChains.characterId, row.id))
      .orderBy(asc(characterChains.order)),
  ])

  return { row, archetypeRows, inventoryRows, knives, chains }
}

async function hydrate(row: CharacterRow): Promise<HydratedCharacter> {
  return deriveHydratedCharacter(await fetchRawInputs(row))
}

/** The raw `characters` row by id, or `null` when no character matches. */
export async function loadCharacterRowById(
  characterId: string
): Promise<CharacterRow | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  return row ?? null
}

/**
 * Cheap existence check used by every optimistic-concurrency write wrapper to
 * disambiguate a zero-row `UPDATE` between `"character-not-found"` (the row
 * was deleted) and `"stale"` (the row exists but its `updatedAt` no longer
 * matches the caller's token). Selects only `id` so the read is index-only.
 */
export async function characterExists(characterId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  return row !== undefined
}

/** The raw `characters` row by public `shortId`, or `null` when none matches. */
export async function loadCharacterRowByShortId(
  shortId: string
): Promise<CharacterRow | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.shortId, shortId))
    .limit(1)

  return row ?? null
}

/**
 * The fully hydrated sheet for the character with `characterId`, or `null`
 * when no character has that id.
 */
export async function loadHydratedCharacterById(
  characterId: string
): Promise<HydratedCharacter | null> {
  const row = await loadCharacterRowById(characterId)
  return row ? hydrate(row) : null
}

/**
 * The fully hydrated sheet for the character with public `shortId`, or `null`
 * when no character has that shortId — the loader the `/c/{shortId}` route
 * uses.
 */
export async function loadHydratedCharacterByShortId(
  shortId: string
): Promise<HydratedCharacter | null> {
  const row = await loadCharacterRowByShortId(shortId)
  return row ? hydrate(row) : null
}
