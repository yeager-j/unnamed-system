import { and, eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { err, ok, type Result } from "@workspace/game/foundation"

import {
  characterExists,
  type CharacterWriteExecutor,
} from "@/lib/db/queries/load-character"
import { characters } from "@/lib/db/schema/character"
import type { VersionClass } from "@/lib/db/version-classes"
import { publishCharacterPing } from "@/lib/realtime/publish"

/**
 * The shared optimistic-concurrency primitive every character write composes
 * through (UNN-248). Each write is gated on one of the four per-write-class
 * version tokens (the UNN-140 baseline) and follows the same guarded shape:
 * bump `<class>Version` while conditioning on `(id, <class>Version)`, then on
 * zero affected rows disambiguate `"stale"` vs `"character-not-found"`.
 *
 * `updatedAt` is intentionally not set here — the schema column carries
 * `.$onUpdate(() => new Date())`, so every UPDATE refreshes it automatically.
 */

export type GuardedVersionError = "character-not-found" | "stale"

export type { CharacterWriteExecutor }

const VERSION_COLUMNS = {
  identity: characters.identityVersion,
  vitals: characters.vitalsVersion,
  inventory: characters.inventoryVersion,
  progression: characters.progressionVersion,
} as const satisfies Record<VersionClass, unknown>

/**
 * The typed `SET` fragment that increments a version class's token by one.
 * Exposed so the few writes that keep a bespoke `UPDATE` (dual-class level-up,
 * the SQL-clamped Exhaustion adjust) compose the same increment everyone else
 * does rather than re-spelling the `sql` template.
 */
export function characterVersionIncrement(
  versionClass: VersionClass
): PgUpdateSetSource<typeof characters> {
  switch (versionClass) {
    case "identity":
      return { identityVersion: sql`${characters.identityVersion} + 1` }
    case "vitals":
      return { vitalsVersion: sql`${characters.vitalsVersion} + 1` }
    case "inventory":
      return { inventoryVersion: sql`${characters.inventoryVersion} + 1` }
    case "progression":
      return { progressionVersion: sql`${characters.progressionVersion} + 1` }
  }
}

/**
 * Disambiguates a zero-row guarded write: the row is gone
 * (`"character-not-found"`) or it exists but its version token moved past the
 * caller's expectation (`"stale"`). Every guarded write funnels its zero-row
 * branch through here, so the disambiguation lives in exactly one place. The
 * existence read runs on the caller's `executor` so an in-transaction write
 * checks against its own snapshot rather than a separate connection.
 */
export async function staleOrMissing(
  executor: CharacterWriteExecutor,
  characterId: string
): Promise<Result<never, GuardedVersionError>> {
  return (await characterExists(characterId, executor))
    ? err("stale")
    : err("character-not-found")
}

/**
 * Runs the guarded single-class version bump: applies `patch` together with
 * the `versionClass` increment in one `SET`, conditioned on
 * `(id, <class>Version === expectedVersion)`, and returns the bumped version.
 * On zero affected rows it returns {@link staleOrMissing}'s verdict.
 *
 * On success it also fires the realtime invalidation ping (UNN-370) — this is
 * the single choke point nearly every character write composes through, so the
 * ping can't be forgotten per write. A guard-rejected write publishes nothing.
 */
export async function bumpCharacterVersionGuarded(
  executor: CharacterWriteExecutor,
  characterId: string,
  versionClass: VersionClass,
  expectedVersion: number,
  patch?: Partial<typeof characters.$inferInsert>
): Promise<Result<{ version: number }, GuardedVersionError>> {
  const column = VERSION_COLUMNS[versionClass]

  const updated = await executor
    .update(characters)
    .set({ ...patch, ...characterVersionIncrement(versionClass) })
    .where(and(eq(characters.id, characterId), eq(column, expectedVersion)))
    .returning({ version: column, shortId: characters.shortId })

  if (updated.length === 0) return staleOrMissing(executor, characterId)

  const { version, shortId } = updated[0]!
  publishCharacterPing(shortId, "character", { [versionClass]: version })

  return ok({ version })
}
