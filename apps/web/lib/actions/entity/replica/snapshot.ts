"use server"

import { and, eq } from "drizzle-orm"

import type { Accepted } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import type { EntityComponents } from "@/domain/entity/replica/mutations"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireOwnerOrCampaignDMForEntity } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { replicaClient } from "@/lib/db/schema/replica-client"

import {
  EntityAcceptedRequestSchema,
  type EntityAcceptedRequest,
} from "./wire.schema"

export type EntityAccepted = Accepted<EntityComponents, EntityVersionVector>

export type EntityAcceptedError = "invalid-input" | "entity-load-failed"

/**
 * The personalized accepted-snapshot read (UNN-645; the read half of the
 * replica transport's `fetchAccepted`) — a **read-only action** per the
 * UNN-580 precedent: parse → gate → read, no revalidate, and per-viewer by
 * construction so it must never be cached.
 *
 * The atomic-observation AC lives in the query shape: ONE statement joins the
 * entity row with the requesting client's dedup row, so `value` (the
 * component bag), `through` (that client's incorporation watermark), and
 * `cursor` (the per-class version vector) come from a single Postgres
 * snapshot. Two statements — even inside a transaction — would not give that
 * under READ COMMITTED, where each statement sees its own snapshot.
 *
 * A client with no dedup row yet reads `through: 0` (nothing of theirs
 * incorporated — the LEFT JOIN's honest null). The gate is the widest write
 * posture (owner-or-campaign-DM): a replica exists to write, and the
 * class-level strictness is enforced per-mutation at the push door.
 */
export async function loadEntityAcceptedAction(
  input: EntityAcceptedRequest
): Promise<Result<EntityAccepted, EntityAcceptedError>> {
  const parsed = EntityAcceptedRequestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { entityId, clientGroupId, clientId } = parsed.data

  await requireOwnerOrCampaignDMForEntity(entityId)

  const [row] = await db
    .select({ entity, lastMutationId: replicaClient.lastMutationId })
    .from(entity)
    .leftJoin(
      replicaClient,
      and(
        eq(replicaClient.entityId, entity.id),
        eq(replicaClient.clientGroupId, clientGroupId),
        eq(replicaClient.clientId, clientId)
      )
    )
    .where(eq(entity.id, entityId))
  if (!row) return err("entity-load-failed")

  const loaded = loadEntityRow(row.entity)
  if (!loaded.ok) return err("entity-load-failed")

  return ok({
    value: loaded.value.components,
    through: row.lastMutationId ?? 0,
    cursor: {
      identity: row.entity.identityVersion,
      vitals: row.entity.vitalsVersion,
      inventory: row.entity.inventoryVersion,
      progression: row.entity.progressionVersion,
    },
  })
}
