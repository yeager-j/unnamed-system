import { and, asc, eq, max } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { characterChains, characterKnives } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS, type EditSurface } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Shared persistence for the Step-3 "named entry list" tables — Knives and
 * Chains. Both schemas are identical (`{id, characterId, title, description,
 * order}`) and both run the same identity-class child-table pattern:
 * conditionally bump `characters.identityVersion` inside a transaction first
 * (the row lock blocks concurrent identity writers, the WHERE-on-version
 * misses cleanly on `"stale"`), then insert / update / delete the child row.
 *
 * Each table-specific module (`character-knives.ts`, `character-chains.ts`)
 * is a 30-line wrapper around the helpers below, with its own
 * domain-named error string (`"knife-not-found"` vs `"chain-not-found"`)
 * so callers don't have to special-case a generic.
 */

/**
 * The two supported tables. Both have the exact same column shape; the only
 * thing that differs at runtime is which physical table to write to.
 */
export type NamedEntryTable = typeof characterKnives | typeof characterChains

/** Knives and Chains are distinct identity-class edit surfaces; derive which
 *  from the table being written so the bump references the shared map. */
function surfaceForTable(table: NamedEntryTable): EditSurface {
  return table === characterKnives ? "knives" : "chains"
}

interface AddSuccess {
  id: string
  order: number
  version: number
}

interface MutationSuccess {
  version: number
}

type CommonError = "character-not-found" | "stale"

/**
 * Appends a new entry to the end of the list. `order` is one more than
 * `MAX(order)` for this character, computed inside the same transaction so
 * two parallel adds don't collide.
 */
export async function addNamedEntry(
  table: NamedEntryTable,
  characterId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<AddSuccess, CommonError>> {
  return db.transaction(async (tx) => {
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS[surfaceForTable(table)],
      expectedVersion
    )
    if (!bumped.ok) return bumped

    const [maxRow] = await tx
      .select({ value: max(table.order) })
      .from(table)
      .where(eq(table.characterId, characterId))
    const nextOrder = (maxRow?.value ?? -1) + 1

    const [inserted] = await tx
      .insert(table)
      .values({
        characterId,
        title,
        description: normalizeDescription(description),
        order: nextOrder,
      })
      .returning({ id: table.id, order: table.order })

    return ok({
      id: inserted!.id,
      order: inserted!.order,
      version: bumped.value.version,
    })
  })
}

/**
 * Writes the entry's title. Per-field instead of full-row so a concurrent
 * description save can't clobber it via stale closure (the bug the split
 * was created to fix).
 */
export async function updateNamedEntryTitle<E extends string>(
  table: NamedEntryTable,
  notFoundError: E,
  characterId: string,
  entryId: string,
  title: string,
  expectedVersion: number
): Promise<Result<MutationSuccess, CommonError | E>> {
  return updateNamedEntryFields(
    table,
    notFoundError,
    characterId,
    entryId,
    { title },
    expectedVersion
  )
}

/**
 * Writes the entry's description. Trimmed-empty normalizes to `null` so the
 * column stays a clean set/unset.
 */
export async function updateNamedEntryDescription<E extends string>(
  table: NamedEntryTable,
  notFoundError: E,
  characterId: string,
  entryId: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<MutationSuccess, CommonError | E>> {
  return updateNamedEntryFields(
    table,
    notFoundError,
    characterId,
    entryId,
    { description: normalizeDescription(description) },
    expectedVersion
  )
}

export async function removeNamedEntry<E extends string>(
  table: NamedEntryTable,
  notFoundError: E,
  characterId: string,
  entryId: string,
  expectedVersion: number
): Promise<Result<MutationSuccess, CommonError | E>> {
  return db.transaction(async (tx) => {
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS[surfaceForTable(table)],
      expectedVersion
    )
    if (!bumped.ok) return bumped

    const removed = await tx
      .delete(table)
      .where(and(eq(table.id, entryId), eq(table.characterId, characterId)))
      .returning({ id: table.id })

    if (removed.length === 0) return err(notFoundError)
    return ok({ version: bumped.value.version })
  })
}

/**
 * Reads the rows for one character, ordered by their `order` column so
 * display matches the canonical insertion order.
 */
export async function loadNamedEntries(
  table: NamedEntryTable,
  characterId: string
) {
  return db
    .select()
    .from(table)
    .where(eq(table.characterId, characterId))
    .orderBy(asc(table.order))
}

async function updateNamedEntryFields<E extends string>(
  table: NamedEntryTable,
  notFoundError: E,
  characterId: string,
  entryId: string,
  patch: { title?: string; description?: string | null },
  expectedVersion: number
): Promise<Result<MutationSuccess, CommonError | E>> {
  return db.transaction(async (tx) => {
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS[surfaceForTable(table)],
      expectedVersion
    )
    if (!bumped.ok) return bumped

    const updated = await tx
      .update(table)
      .set(patch)
      .where(and(eq(table.id, entryId), eq(table.characterId, characterId)))
      .returning({ id: table.id })

    if (updated.length === 0) return err(notFoundError)
    return ok({ version: bumped.value.version })
  })
}

function normalizeDescription(description: string | null): string | null {
  return description?.trim().length ? description : null
}
