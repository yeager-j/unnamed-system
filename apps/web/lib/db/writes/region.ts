import { eq } from "drizzle-orm"

import type {
  RegionSettings,
  StaticReveal,
} from "@workspace/game-v2/generation"
import { type Result } from "@workspace/result"

import { db, type WriteExecutor } from "@/lib/db/client"
import { regions } from "@/lib/db/schema/region"
import { insertWithShortId } from "@/lib/db/short-id"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

/**
 * Persistence for the `region` table (UNN-589 D2/D5). Auth-free like every
 * write wrapper; `requireCampaignDM` lives at the Server Action boundary.
 *
 * A single `version` token guards the settings/name/archive mutations. The one
 * cross-row composition is {@link foldRegionStaticReveal}, which
 * `finishExpeditionAction` runs inside its `guardMany` — the region is the
 * **last** row in the lifecycle lock order (dungeon → mapInstance → encounter
 * → region), and its version is server-read inside that transaction (the
 * client never holds a region token).
 */

export type RegionWriteError = "region-not-found" | "stale"

/** Creates a Region with a minted, collision-retried `shortId`. The fold
 *  columns ride their DB defaults (`[]` / `{}`) — knowledge starts empty. */
export async function createRegion(input: {
  campaignId: string
  name: string
  seedMapId: string
  templateSetId: string
  settings: RegionSettings
}): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await db
      .insert(regions)
      .values({
        shortId,
        campaignId: input.campaignId,
        name: input.name,
        seedMapId: input.seedMapId,
        templateSetId: input.templateSetId,
        settings: input.settings,
      })
      .returning({ id: regions.id, shortId: regions.shortId })

    return row!
  })
}

/** The guarded settings write (authored defaults only, D7 — running
 *  expeditions keep the values stamped at their mint). */
export async function updateRegionSettings(
  regionId: string,
  patch: { name: string; settings: RegionSettings },
  expectedVersion: number
): Promise<Result<{ version: number }, RegionWriteError>> {
  return bumpRegionVersionGuarded(db, regionId, expectedVersion, patch)
}

/**
 * The finish-time fold commit (D5): replaces the `staticReveal` blob with the
 * fold `generation/fold.ts` computed, guarded on the version the transaction
 * read. Exported for composition inside `finishExpeditionAction`'s `guardMany`
 * — pass the `tx` so the write shares the lifecycle transaction.
 */
export async function foldRegionStaticReveal(
  executor: WriteExecutor,
  regionId: string,
  expectedVersion: number,
  staticReveal: StaticReveal
): Promise<Result<{ version: number }, RegionWriteError>> {
  return bumpRegionVersionGuarded(executor, regionId, expectedVersion, {
    staticReveal,
  })
}

/**
 * Archives a Region (`archivedAt` flip) — hides it from campaign surfaces while
 * expedition history keeps resolving it. Guarded (unlike a soft delete's
 * idempotent tombstone) because archive rides the same settings surface and a
 * stale archive over a concurrent rename would silently drop the rename.
 */
export async function archiveRegion(
  regionId: string,
  expectedVersion: number
): Promise<Result<{ version: number }, RegionWriteError>> {
  return bumpRegionVersionGuarded(db, regionId, expectedVersion, {
    archivedAt: new Date(),
  })
}

/**
 * Hard-deletes a Region — legal only in the zero-expedition mistake case; the
 * action checks app-side first and `dungeon.regionId`'s FK is the backstop
 * (the delete throws instead of orphaning if a check was missed). A single-row
 * delete: a Region owns no instance (D5).
 */
export async function hardDeleteRegion(regionId: string): Promise<void> {
  await db.delete(regions).where(eq(regions.id, regionId))
}

/** The shared single-version guard, bound to this aggregate's table + error. */
async function bumpRegionVersionGuarded(
  executor: WriteExecutor,
  regionId: string,
  expectedVersion: number,
  patch: Partial<typeof regions.$inferInsert>
): Promise<Result<{ version: number }, RegionWriteError>> {
  return guardedVersionUpdate({
    table: regions,
    id: regionId,
    expectedVersion,
    patch,
    notFound: "region-not-found",
    executor,
  })
}
