import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import {
  requireEntityOwner,
  requireOwnerOrCampaignDMForEntity,
} from "@/lib/auth/campaign-access"
import type { EntityStatus } from "@/lib/db/schema/entity"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
  type EntityWriteRefusal,
  type WriterDeps,
} from "@/lib/entity/commit/writers"
import { loadEntityRow } from "@/lib/game-v2/entity-row-to-bag"

import {
  bumpEntityVersionGuarded,
  type EntityGuardError,
} from "./version-guard"

/**
 * The **durable entity Store** (UNN-551; ADR §2.4) — the one native commit path
 * for a component write against an `entity` row, shared by the character surfaces
 * (the entity door) and combat's durable arm (the encounter door forwards here).
 * `Writer ∘ entityRowStore`, always — no storage fork downstream of the address.
 *
 * The whole path in one place: authorize (the Store's gate — see below), assemble
 * the row into a runtime entity, run the Writer's pure `applyOp` to predict the
 * patch, then commit it version-guarded on the Writer's own class. The patch
 * composition lives server-side here (descriptor-in), so "the client composes
 * the full post-state" is unrepresentable (UNN-226).
 *
 * **The gate is a fact of the Writer's class (UNN-556).** v1 granted the campaign
 * DM exactly the in-play surfaces (pools/mechanics — the vitals class); creation
 * and identity state were always owner-only. The same CH4 move that made the
 * version class a Writer fact makes the auth posture one: a `vitals`-class write
 * admits owner-or-campaign-DM (the DM console's sanctioned access), every other
 * class requires the strict owner — a DM must not be able to rewrite a placed
 * player's Origin, Virtues, or narrative (Secrets!) through this door.
 */

export type EntityWriteError =
  | EntityWriteRefusal
  | EntityGuardError
  | "entity-load-failed"

/** The bumped class token + the entity's shortId (the pinged channel key) and
 *  lifecycle status (the entity door's revalidation reads it). */
export interface EntityCommit {
  version: number
  shortId: string
  status: EntityStatus
}

/**
 * Resolved values a Writer's validation needs, derived server-side (never the
 * wire). Only Prisma's cap today, which stays `undefined` until the v2 upgrade
 * tree ships a resolvable max — so `usePrisma` refuses `no-prisma-max` and no
 * Prisma affordance renders (parity with the session arm). A vitals/skillPool/
 * mechanic write needs none of it.
 */
function serverDeps(): WriterDeps {
  return {}
}

export async function commitEntityWrite(
  entityId: string,
  write: EntityWrite,
  expectedVersion: number
): Promise<Result<EntityCommit, EntityWriteError>> {
  const { durableClass } = ENTITY_WRITERS[write.component]
  const row =
    durableClass === "vitals"
      ? await requireOwnerOrCampaignDMForEntity(entityId)
      : await requireEntityOwner(entityId)

  const loaded = loadEntityRow(row)
  if (!loaded.ok) return err("entity-load-failed")

  const predicted = applyEntityWrite(
    loaded.value.components,
    write,
    serverDeps()
  )
  if (!predicted.ok) return predicted

  const bumped = await bumpEntityVersionGuarded(
    entityId,
    durableClass,
    expectedVersion,
    predicted.value
  )
  if (!bumped.ok) return bumped

  return ok({
    version: bumped.value.version,
    shortId: row.shortId,
    status: row.status,
  })
}
