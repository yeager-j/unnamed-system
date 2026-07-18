"use server"

import { and, eq } from "drizzle-orm"

import type { Accepted } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import type { EntityReplicaState } from "@/domain/entity/replica/mutations"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { replicaClient } from "@/lib/db/schema/replica-client"

import {
  EntityAcceptedRequestSchema,
  type EntityAcceptedRequest,
} from "./wire.schema"

export type EntityAccepted = Accepted<EntityReplicaState, EntityVersionVector>

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
 * **This read REGISTERS the client** (idempotent insert, Codex P2 on PR
 * #385): the personalized snapshot is a replica's mandatory bootstrap —
 * `initial` and the ID floor come from it — so minting the dedup row here is
 * what licenses the push door's reading of an absent row as "swept or never
 * bootstrapped" (→ `unknown-client`) rather than "new", closing the
 * redelivered-first-mutation double-apply. A read-only action taking one
 * idempotent bootstrap write is the sanctioned deviation, documented here.
 *
 * A freshly registered client reads `through: 0` — nothing of theirs
 * incorporated yet.
 *
 * **The gate is strict-owner** (Codex review, PR #384): this read returns the
 * FULL component bag — including `narrative`, which every character route
 * redacts for non-owners — so admitting the campaign DM here would leak
 * Secrets. That matches the design's redaction constraint ("redacted surfaces
 * are not forced onto the replica; authorization takes precedence"): the P3
 * entity replica serves owner surfaces; the DM's in-play writes ride the
 * combat binding (UNN-646), whose root is scoped to state the DM may hold.
 * A DM-facing entity replica would need a redacted root — a narrower state,
 * not this bag behind a wider gate.
 */
export async function loadEntityAcceptedAction(
  input: EntityAcceptedRequest
): Promise<Result<EntityAccepted, EntityAcceptedError>> {
  const parsed = EntityAcceptedRequestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { entityId, clientGroupId, clientId } = parsed.data

  await requireEntityOwner(entityId)

  // Bootstrap registration (see the module doc): a client identity exists at
  // the push door only if it passed through here first. A re-fetch refreshes
  // `updatedAt`, so a living tab's registration never ages into the TTL
  // sweep no matter how long it goes without writing; only tabs that stop
  // fetching are reaped. An identity recycled against a different entity
  // keeps its original row (`entityId` is not in the update set) and is
  // caught by the push door's pinned-entity check.
  await db
    .insert(replicaClient)
    .values({ clientGroupId, clientId, entityId, lastMutationId: 0 })
    .onConflictDoUpdate({
      target: [replicaClient.clientGroupId, replicaClient.clientId],
      set: { updatedAt: new Date() },
    })

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
    value: {
      components: loaded.value.components,
      columns: {
        name: row.entity.name,
        portraitUrl: row.entity.portraitUrl,
        pronouns: row.entity.pronouns,
        notes: row.entity.notes,
      },
    },
    through: row.lastMutationId ?? 0,
    cursor: {
      identity: row.entity.identityVersion,
      vitals: row.entity.vitalsVersion,
      inventory: row.entity.inventoryVersion,
      progression: row.entity.progressionVersion,
    },
  })
}
