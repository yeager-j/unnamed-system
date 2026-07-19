import { z } from "zod/v4"

import type { ProcessRefusal } from "@workspace/replica/server"

import type { MapInstanceReplicaRejection } from "@/domain/map/replica/rejection"
import { ReplicaMutationEnvelopeSchema } from "@/lib/actions/replica/wire.schema"

export const MapInstancePushSchema = z.object({
  mapInstanceId: z.string().min(1),
  envelope: ReplicaMutationEnvelopeSchema,
})

export type MapInstancePushInput = z.input<typeof MapInstancePushSchema>

export const MapInstanceAcceptedRequestSchema = z.object({
  mapInstanceId: z.string().min(1),
  identity: z.object({
    clientGroupId: z.string().min(1),
    clientId: z.string().min(1),
  }),
})

export type MapInstanceAcceptedRequest = z.input<
  typeof MapInstanceAcceptedRequestSchema
>

export type MapInstancePushError =
  | "invalid-input"
  | ProcessRefusal<MapInstanceReplicaRejection>
