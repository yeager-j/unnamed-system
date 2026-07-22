import { and, eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { type StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"

import type { EntityWritePatch } from "@/domain/entity/commit/writers"
import { entityAxisFor } from "@/lib/db/axes"
import { type WriteExecutor } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"

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
 * All callers now supply the authority attempt's stamp. The architecture gate in
 * `depcheck.mjs` rejects both a raw version increment elsewhere and an unapproved
 * caller of this primitive or its stamped Stores.
 */

/**
 * The app-owned column half of a guarded write. Only the substrate content
 * columns are guarded here; the PC-lifecycle columns moved to the
 * `playerCharacter` subtype (R3 — UNN-573) and write unguarded through it —
 * `builderStep` as a plain subtype update, `status` as finalize's transactional
 * subtype flip, `campaignId` as placement (v1 parity).
 *
 * Since UNN-675 the *ordinary* writes to these columns come from
 * `identityWritePatch` through the `entity.identity` mutation, which composes
 * exactly this shape through {@link advanceEntityAxisGuarded}. This type survives
 * as the column half of {@link EntityRowPatch}; finalize is the one registered
 * mutation whose component patch spans several durable columns.
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
 * version is recorded on the attempt's stamp, which owns revision validation.
 *
 * That last step is the load-bearing one: an advance recorded on the stamp is an
 * advance the executor will expire the cache tag for and publish an invalidation
 * for. Bumping a version column *without* stamping is precisely the incoherence
 * the P2e gate (UNN-677) exists to forbid, so keeping the bump and the stamp in
 * one function makes the pair impossible to separate by accident.
 *
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
  stamp.record(entityAxisFor[versionClass](row.id), committedVersion)
  return committedVersion
}
