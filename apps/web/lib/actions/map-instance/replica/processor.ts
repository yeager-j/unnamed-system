import { and, eq, isNull, sql } from "drizzle-orm"

import { storedSessionSchema } from "@workspace/game-v2/encounter"
import { mapInstanceStateSchema } from "@workspace/game-v2/spatial"
import {
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import { err, ok, type Result } from "@workspace/result"

import {
  mapInstanceMutations,
  type MapInstanceInvocation,
  type MapInstanceReplicaState,
} from "@/domain/map/replica/mutations"
import type { MapInstanceReplicaRejection } from "@/domain/map/replica/rejection"
import { type WriteExecutor } from "@/lib/db/client"
import type { MapInstanceAccessEnvelope } from "@/lib/db/queries/map-instance-access"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { mapInstanceReplicaClient } from "@/lib/db/schema/map-instance-replica-client"
import { playerCharacter } from "@/lib/db/schema/player-character"

import { createDrizzleMutationProcessor } from "../../replica/drizzle-processor"

export interface MapInstancePushContext {
  readonly mapInstanceId: string
  readonly authorization: Result<
    MapInstanceAccessEnvelope,
    MapInstanceReplicaRejection
  >
  committed?: { version: number }
}

export type MapInstancePushProcessor = MutationProcessor<
  MapInstancePushContext,
  MapInstanceReplicaRejection,
  void
>

export function createMapInstancePushProcessor(
  mapInstanceId: string
): MapInstancePushProcessor {
  return createDrizzleMutationProcessor({
    mutations: mapInstanceMutations,
    ledger: {
      table: mapInstanceReplicaClient,
      pinColumn: mapInstanceReplicaClient.mapInstanceId,
      pinValue: mapInstanceId,
    },
    execute: executeMapInstanceMutation,
    onEvent: logProcessorEvent,
  })
}

async function executeMapInstanceMutation(
  tx: WriteExecutor,
  invocation: MapInstanceInvocation,
  context: MapInstancePushContext
): Promise<Result<void, MapInstanceReplicaRejection>> {
  if (!context.authorization.ok) return context.authorization
  const [row] = await tx
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, context.mapInstanceId))
    .for("update")
  if (!row) return err("map-instance-not-found")

  const parsed = mapInstanceStateSchema.safeParse(row.state)
  if (!parsed.success) return err("invalid-state")
  const event = invocation.args.event
  if (
    event.kind === "placeCombatant" &&
    parsed.data.occupancy[event.tokenKey] === undefined &&
    !(await isAuthorizedNewToken(
      tx,
      context.mapInstanceId,
      context.authorization.value.campaignId,
      event.tokenKey
    ))
  ) {
    return err("token-not-authorized")
  }
  const root: MapInstanceReplicaState = {
    state: parsed.data,
    status: row.status,
  }
  const definition = mapInstanceMutations.get(invocation.name)
  if (!definition) return err("invalid-write")
  const applied = definition.apply(root, invocation.args, { phase: "rebase" })
  if (!applied.ok) return applied
  if (applied.value === root) return ok(undefined)

  const [updated] = await tx
    .update(mapInstances)
    .set({
      state: applied.value.state,
      version: sql`${mapInstances.version} + 1`,
    })
    .where(eq(mapInstances.id, context.mapInstanceId))
    .returning({ version: mapInstances.version })
  if (!updated)
    throw new Error(`map instance ${context.mapInstanceId} vanished`)
  context.committed = updated
  return ok(undefined)
}

async function isAuthorizedNewToken(
  tx: WriteExecutor,
  mapInstanceId: string,
  campaignId: string,
  tokenKey: string
): Promise<boolean> {
  const [placed] = await tx
    .select({ id: playerCharacter.entityId })
    .from(playerCharacter)
    .innerJoin(entity, eq(entity.id, playerCharacter.entityId))
    .where(
      and(
        eq(playerCharacter.entityId, tokenKey),
        eq(playerCharacter.campaignId, campaignId),
        eq(playerCharacter.status, "finalized"),
        isNull(entity.deletedAt)
      )
    )
    .limit(1)
  if (placed) return true

  const rows = await tx
    .select({ session: encounters.session })
    .from(encounters)
    .where(eq(encounters.mapInstanceId, mapInstanceId))
  return rows.some((row) => {
    const session = storedSessionSchema.safeParse(row.session)
    return (
      session.success &&
      session.data.participants.some(({ id }) => id === tokenKey)
    )
  })
}

function logProcessorEvent(event: ProcessorEvent): void {
  if (event.kind === "recorded" && event.outcome === "accepted") return
  console.warn("[map-instance-replica]", JSON.stringify(event))
}
