"use server"

import { and, eq } from "drizzle-orm"

import { mapInstanceStateSchema } from "@workspace/game-v2/spatial"
import type { Accepted } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { MapInstanceReplicaState } from "@/domain/map/replica/mutations"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { loadMapInstanceAccessEnvelope } from "@/lib/db/queries/map-instance-access"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { mapInstanceReplicaClient } from "@/lib/db/schema/map-instance-replica-client"

import {
  MapInstanceAcceptedRequestSchema,
  type MapInstanceAcceptedRequest,
} from "./wire.schema"

export type MapInstanceAccepted = Accepted<MapInstanceReplicaState, number>
export type MapInstanceAcceptedError =
  | "invalid-input"
  | "map-instance-not-found"
  | "invalid-state"

export async function loadMapInstanceAcceptedAction(
  input: MapInstanceAcceptedRequest
): Promise<Result<MapInstanceAccepted, MapInstanceAcceptedError>> {
  const parsed = MapInstanceAcceptedRequestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { mapInstanceId, identity } = parsed.data

  const access = await loadMapInstanceAccessEnvelope(mapInstanceId)
  if (!access) return err("map-instance-not-found")
  await requireCampaignDM(access.campaignId)

  await db
    .insert(mapInstanceReplicaClient)
    .values({
      ...identity,
      mapInstanceId,
      lastMutationId: 0,
    })
    .onConflictDoUpdate({
      target: [
        mapInstanceReplicaClient.clientGroupId,
        mapInstanceReplicaClient.clientId,
      ],
      set: { updatedAt: new Date() },
    })

  const [joined] = await db
    .select({
      row: mapInstances,
      through: mapInstanceReplicaClient.lastMutationId,
    })
    .from(mapInstances)
    .leftJoin(
      mapInstanceReplicaClient,
      and(
        eq(mapInstanceReplicaClient.mapInstanceId, mapInstances.id),
        eq(mapInstanceReplicaClient.clientGroupId, identity.clientGroupId),
        eq(mapInstanceReplicaClient.clientId, identity.clientId)
      )
    )
    .where(eq(mapInstances.id, mapInstanceId))
  if (!joined) return err("map-instance-not-found")
  const state = mapInstanceStateSchema.safeParse(joined.row.state)
  if (!state.success) return err("invalid-state")
  return ok({
    value: { state: state.data, status: joined.row.status },
    through: joined.through ?? 0,
    cursor: joined.row.version,
  })
}
