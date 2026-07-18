import { and, eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { err, ok, type Result } from "@workspace/result"

import type { EntityWritePatch } from "@/domain/entity/commit/writers"
import { db } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"
import { publishCharacterPing } from "@/lib/realtime/publish"

/**
 * The entity-row optimistic-concurrency primitive (UNN-551) — the durable-entity
 * successor of `bumpCharacterVersionGuarded`. The `entity` row carries the same
 * four per-write-class tokens (CH4); a guarded write bumps exactly one class while
 * conditioning on `(id, <class>Version === expectedVersion)`, then disambiguates a
 * zero-row result.
 *
 * The **per-class peer** of the single-`version` {@link
 * import("@/lib/db/writes/guarded-update").guardedVersionUpdate} the other
 * aggregates share: same conditioned-update shape, but this one picks the token
 * column by write-class and returns the row's `shortId` for the realtime ping —
 * a different cardinality, kept its own home (UNN-597).
 *
 * The component-column projection (CH15) makes this structurally safe: the patch's
 * keys are 1:1 with `entity` component **columns**, so `SET`ing them touches only
 * the written components and cannot clobber a sibling class's column (where a
 * shared jsonb bag made that a matter of `jsonb_set` discipline).
 *
 * On success it fires the realtime ping keyed by the entity's `shortId` — the same
 * `character`-domain channel the DM console's per-PC subscription listens on
 * (`ParticipantMeta.characterShortId`), so a durable write in combat invalidates
 * every watcher. A guard-rejected write publishes nothing.
 */

export type EntityGuardError = "entity-not-found" | "stale"

/**
 * The app-owned column half of a guarded write. UNN-648's replica processor
 * uses the same patch vocabulary under a row lock; legacy classic actions keep
 * composing this guard until UNN-649 contracts them. PC-lifecycle columns live
 * on the `playerCharacter` subtype.
 */
export type EntityColumnPatch = Partial<
  Pick<EntityRow, "name" | "portraitUrl" | "pronouns" | "notes">
>

/**
 * Everything one guarded UPDATE may SET: component columns (a Writer's patch)
 * and/or app-owned columns (a column action's patch). Both species bump their
 * declared class; finalize is the one write that spans both halves.
 */
export type EntityRowPatch = EntityWritePatch & EntityColumnPatch

/** The class → `entity` version-column map — one authority for which column a
 *  write class reads and bumps, shared with the replica push door (UNN-645). */
export const VERSION_COLUMNS = {
  identity: entity.identityVersion,
  vitals: entity.vitalsVersion,
  inventory: entity.inventoryVersion,
  progression: entity.progressionVersion,
} as const satisfies Record<VersionClass, unknown>

/** The one-class `SET` increment for a guarded (or row-locked) entity UPDATE. */
export function entityVersionIncrement(
  versionClass: VersionClass
): PgUpdateSetSource<typeof entity> {
  switch (versionClass) {
    case "identity":
      return { identityVersion: sql`${entity.identityVersion} + 1` }
    case "vitals":
      return { vitalsVersion: sql`${entity.vitalsVersion} + 1` }
    case "inventory":
      return { inventoryVersion: sql`${entity.inventoryVersion} + 1` }
    case "progression":
      return { progressionVersion: sql`${entity.progressionVersion} + 1` }
  }
}

async function staleOrMissing(
  entityId: string
): Promise<Result<never, EntityGuardError>> {
  const [row] = await db
    .select({ id: entity.id })
    .from(entity)
    .where(eq(entity.id, entityId))
    .limit(1)
  return row ? err("stale") : err("entity-not-found")
}

export async function bumpEntityVersionGuarded(
  entityId: string,
  versionClass: VersionClass,
  expectedVersion: number,
  patch: EntityRowPatch
): Promise<Result<{ version: number }, EntityGuardError>> {
  const column = VERSION_COLUMNS[versionClass]

  const updated = await db
    .update(entity)
    .set({ ...patch, ...entityVersionIncrement(versionClass) })
    .where(and(eq(entity.id, entityId), eq(column, expectedVersion)))
    .returning({ version: column, shortId: entity.shortId })

  if (updated.length === 0) return staleOrMissing(entityId)

  const { version, shortId } = updated[0]!
  publishCharacterPing(shortId, "entity", { [versionClass]: version })

  return ok({ version })
}
