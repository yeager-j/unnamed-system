import { z } from "zod/v4"

import type { ProcessRefusal } from "@workspace/replica/server"

import type { EntityReplicaRejection } from "@/domain/entity/replica/rejection"
import { ReplicaMutationEnvelopeSchema } from "@/lib/actions/replica/wire.schema"

/**
 * The replica door's wire (UNN-645): the transport envelope around one
 * `entity.write` mutation, plus the entity the client group addresses (the
 * protocol envelope itself carries only client identity — the entity binding
 * is Showtime's, so it rides beside the envelope, not inside it).
 *
 * The shared envelope schema deliberately leaves mutation arguments unknown;
 * its module documents why decoding belongs inside the processor.
 */
export const EntityPushSchema = z.object({
  entityId: z.string().min(1),
  envelope: ReplicaMutationEnvelopeSchema,
})

export type EntityPushInput = z.input<typeof EntityPushSchema>

/**
 * The push action's error side: transport-shape refusal, or the processor's
 * refusal taxonomy verbatim. `rejected`/`invalid`/`unknown-mutation` are the
 * mutation's terminal outcome (recorded, watermark advanced);
 * `unknown-client`, `gap`, and `outcome-unavailable` are protocol refusals —
 * nothing recorded — and the source collapses all three to the transport's
 * `unknown-client`, expiring the replica for an application rebuild.
 */
export type EntityPushError =
  | "invalid-input"
  | ProcessRefusal<EntityReplicaRejection>

/** The identity half of a personalized snapshot read. */
export const EntityAcceptedRequestSchema = z.object({
  entityId: z.string().min(1),
  clientGroupId: z.string().min(1),
  clientId: z.string().min(1),
})

export type EntityAcceptedRequest = z.input<typeof EntityAcceptedRequestSchema>
