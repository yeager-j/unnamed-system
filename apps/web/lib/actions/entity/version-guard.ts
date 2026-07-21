import { and, eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { revision, type StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWritePatch } from "@/domain/entity/commit/writers"
import { entityAxisFor } from "@/lib/db/axes"
import { db, type WriteExecutor } from "@/lib/db/client"
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
 *
 * **Legacy: `finalize` is its last caller.** The Stores that replaced it
 * (`commitEntityWrite`, `commitIdentityWrite`) read the class version off the row
 * they loaded and guard on that, so no client token is sent or trusted, a lost
 * race is contention for the authority to rerun, and the advance is recorded on a
 * stamp the executor turns into cache-tag expiry plus axis invalidation. Nothing
 * of that happens here. Do not add callers; P2e's gate (UNN-677) decides whether
 * finalize is routed through the executor or allowlisted with a rationale.
 */

export type EntityGuardError = "entity-not-found" | "stale"

/**
 * The app-owned column half of a guarded write. Only the substrate content
 * columns are guarded here; the PC-lifecycle columns moved to the
 * `playerCharacter` subtype (R3 — UNN-573) and write unguarded through it —
 * `builderStep` as a plain subtype update, `status` as finalize's follow-on flip,
 * `campaignId` as placement (v1 parity).
 *
 * Since UNN-675 the *ordinary* writes to these columns come from
 * `identityWritePatch` through the `entity.identity` mutation, which composes
 * exactly this shape without going through `bumpEntityVersionGuarded`. This type
 * survives as the column half of {@link EntityRowPatch}, which finalize — the one
 * write spanning both halves — still needs.
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

/** The `entity` version-token column for each write class. Exported so the
 *  Headcanon transactional handler can guard on the class column it just read
 *  (UNN-673), reusing the one class→column choice. */
export const VERSION_COLUMNS = {
  identity: entity.identityVersion,
  vitals: entity.vitalsVersion,
  inventory: entity.inventoryVersion,
  progression: entity.progressionVersion,
} as const satisfies Record<VersionClass, unknown>

/** The {@link EntityRow} version-token *field* for each write class — the read
 *  half of the server-authoritative guard (UNN-674): the handler reads the
 *  current class version off the row it loaded and guards its UPDATE on it,
 *  paired with {@link VERSION_COLUMNS} (the SET/WHERE column half). */
export const VERSION_ROW_KEYS = {
  identity: "identityVersion",
  vitals: "vitalsVersion",
  inventory: "inventoryVersion",
  progression: "progressionVersion",
} as const satisfies Record<VersionClass, keyof EntityRow>

/** The atomic `<class>Version = <class>Version + 1` SET fragment for a write
 *  class — the increment half of any guarded entity write. Exported for the
 *  Headcanon handler (UNN-673). */
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

/**
 * **The one protocol-side guarded axis advance** (UNN-675) — every registered
 * entity mutation's commit tail, shared by `commitEntityWrite` and
 * `commitIdentityWrite` and by whatever combat and dungeon add next.
 *
 * It takes the row the attempt *already observed* rather than a version, so a
 * client token is not merely discouraged here but unrepresentable: the expected
 * version can only be the one this attempt read. From there the rule is fixed —
 * `SET` the patch plus the class increment, conditioned on `(id, <class>Version)`;
 * a zero-row result is a lost race, so it throws contention for the authority to
 * rerun the whole handler rather than returning a rejection; and the committed
 * version is parsed into a {@link revision} and recorded on the attempt's stamp.
 *
 * That last step is the load-bearing one: an advance recorded on the stamp is an
 * advance the executor will expire the cache tag for and publish an invalidation
 * for. Bumping a version column *without* stamping is precisely the incoherence
 * the P2e gate (UNN-677) exists to forbid, so keeping the bump and the stamp in
 * one function makes the pair impossible to separate by accident.
 *
 * Compare {@link bumpEntityVersionGuarded}, the legacy form directly below: it
 * takes a client `expectedVersion`, reports a lost race as `"stale"` for the
 * caller to resolve, and pings instead of stamping. Only `finalize` still uses it.
 */
export async function advanceEntityAxisGuarded(
  executor: WriteExecutor,
  row: EntityRow,
  versionClass: VersionClass,
  patch: EntityRowPatch,
  stamp: StampAccumulator
): Promise<number> {
  const column = VERSION_COLUMNS[versionClass]
  const expectedVersion = row[VERSION_ROW_KEYS[versionClass]]

  const updated = await executor
    .update(entity)
    .set({ ...patch, ...entityVersionIncrement(versionClass) })
    .where(and(eq(entity.id, row.id), eq(column, expectedVersion)))
    .returning({ version: column })

  // Zero rows = the class token moved between our read and write: a lost race,
  // not a rejection. Retry the whole handler against current state.
  if (updated.length === 0) throwMutationContention()

  const committedVersion = updated[0]!.version
  const nextRevision = revision(committedVersion)
  if (!nextRevision.ok) {
    // A persisted version column that is not a non-negative safe integer is a
    // storage-integrity fault, not an expected outcome.
    throw new Error(
      `entity ${row.id} ${versionClass}Version is not a valid revision`
    )
  }

  stamp.record(entityAxisFor[versionClass](row.id), nextRevision.value)
  return committedVersion
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
