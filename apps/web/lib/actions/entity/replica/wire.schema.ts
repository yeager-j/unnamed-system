import { z } from "zod/v4"

import type { ProcessRefusal } from "@workspace/replica/server"

import type { EntityReplicaRejection } from "@/domain/entity/replica/rejection"

/**
 * The replica door's wire (UNN-645): the transport envelope around one
 * `entity.write` mutation, plus the entity the client group addresses (the
 * protocol envelope itself carries only client identity — the entity binding
 * is Showtime's, so it rides beside the envelope, not inside it).
 *
 * `args` stays `unknown` here deliberately: the authority's parse is the
 * mutation registry's `decode` inside the processor (the same
 * `entityWriteSchema` the client validated with), and it must run *there* so
 * a failed decode is RECORDED against the watermark (deploy skew) instead of
 * bouncing at the action door as a retryable-looking refusal.
 */
export const EntityPushSchema = z.object({
  entityId: z.string().min(1),
  envelope: z.object({
    clientGroupId: z.string().min(1),
    clientId: z.string().min(1),
    mutationId: z.number().int().positive(),
    invocation: z.object({
      name: z.string().min(1),
      args: z.unknown(),
    }),
  }),
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
