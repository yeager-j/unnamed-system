import { z } from "zod/v4"

/**
 * The shared input envelope every owner-mode mutation carries: the character
 * being written and the per-write-class version token the write is conditioned
 * on (UNN-140 optimistic concurrency). This is the contract of the Server
 * Action write pattern — not a per-domain field — so it lives in one neutral
 * module that each `*.schema.ts` imports and extends, rather than restating it
 * inline (UNN-253).
 *
 * `expectedVersion` is `nonnegative`, not `positive`: a freshly-created
 * character starts every version column at 0, so its very first write
 * legitimately sends 0. Domain schemas add their payload with
 * `characterMutationBase.extend({ … })`.
 */
export const characterMutationBase = z.object({
  characterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
