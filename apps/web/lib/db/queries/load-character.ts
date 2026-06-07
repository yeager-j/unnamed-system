import { asc, eq } from "drizzle-orm"

import { type RawCharacterInputs } from "@workspace/game/engine"
import { type HydratedCharacter } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import {
  characterArchetypes,
  characterChains,
  characterKnives,
  characters,
  inventoryItems,
  type CharacterArchetypeRow,
  type CharacterRow,
} from "@/lib/db/schema/character"
import { deriveHydratedCharacter } from "@/lib/game-engine"

/**
 * Either the auto-resolving {@link db} client or the transaction handle passed
 * to a `db.transaction` callback. Helpers that run inside a transaction accept
 * this so their reads share the caller's snapshot rather than silently
 * escaping to a separate connection.
 */
export type CharacterWriteExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0]

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
 * without crossing into persistence; the assembly stays here. The raw row
 * shapes it reads ({@link CharacterRow} and friends) live beside the tables
 * in `lib/db/schema/character.ts`.
 */

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

/**
 * Fails loudly when a character's persisted Origin points outside its own
 * Archetype rows. `originCharacterArchetypeId` is a permanent identity field
 * (UNN-173) that no UI lets the player edit, so a value that doesn't match a
 * sibling row is data corruption — better to throw here than to silently
 * mislabel Origin downstream. A null Origin (an unfinalized draft) is valid
 * and passes.
 */
function assertOriginBelongsToCharacter(
  row: CharacterRow,
  archetypeRows: CharacterArchetypeRow[]
): void {
  const originId = row.originCharacterArchetypeId
  if (originId === null) return
  if (!archetypeRows.some((archetype) => archetype.id === originId)) {
    throw new Error(
      `Character ${row.id} has originCharacterArchetypeId ${originId}, which is not one of its Archetype rows.`
    )
  }
}

async function hydrate(row: CharacterRow): Promise<HydratedCharacter> {
  const raw = await fetchRawInputs(row)
  assertOriginBelongsToCharacter(row, raw.archetypeRows)
  return deriveHydratedCharacter(raw)
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
export async function characterExists(
  characterId: string,
  executor: CharacterWriteExecutor = db
): Promise<boolean> {
  const [row] = await executor
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
