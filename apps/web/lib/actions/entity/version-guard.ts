import { and, eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"
import type { EntityWritePatch } from "@/lib/entity/commit/writers"
import { publishCharacterPing } from "@/lib/realtime/publish"

/**
 * The entity-row optimistic-concurrency primitive (UNN-551) — the durable-entity
 * successor of `bumpCharacterVersionGuarded`. The `entity` row carries the same
 * four per-write-class tokens (CH4); a guarded write bumps exactly one class while
 * conditioning on `(id, <class>Version === expectedVersion)`, then disambiguates a
 * zero-row result.
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

const VERSION_COLUMNS = {
  identity: entity.identityVersion,
  vitals: entity.vitalsVersion,
  inventory: entity.inventoryVersion,
  progression: entity.progressionVersion,
} as const satisfies Record<VersionClass, unknown>

function entityVersionIncrement(
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
  patch: EntityWritePatch
): Promise<Result<{ version: number }, EntityGuardError>> {
  const column = VERSION_COLUMNS[versionClass]

  const updated = await db
    .update(entity)
    .set({ ...patch, ...entityVersionIncrement(versionClass) })
    .where(and(eq(entity.id, entityId), eq(column, expectedVersion)))
    .returning({ version: column, shortId: entity.shortId })

  if (updated.length === 0) return staleOrMissing(entityId)

  const { version, shortId } = updated[0]!
  publishCharacterPing(shortId, { [versionClass]: version })

  return ok({ version })
}
