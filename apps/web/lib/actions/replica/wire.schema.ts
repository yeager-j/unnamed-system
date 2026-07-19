import { z } from "zod/v4"

/**
 * The transport envelope shared by Showtime's replica push doors. The root
 * binding remains beside this envelope in each door's own schema.
 *
 * `args` stays `unknown` deliberately: the authority's parse is the mutation
 * registry's `decode` inside `createMutationProcessor`, and it must run there
 * so a failed decode is recorded against the watermark (deploy skew) instead
 * of bouncing at the action door as a retryable-looking refusal.
 */
export const ReplicaMutationEnvelopeSchema = z.object({
  clientGroupId: z.string().min(1),
  clientId: z.string().min(1),
  mutationId: z.number().int().positive(),
  invocation: z.object({
    name: z.string().min(1),
    args: z.unknown(),
  }),
})
