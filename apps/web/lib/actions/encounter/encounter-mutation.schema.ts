import { z } from "zod/v4"

/**
 * The shared input envelope every encounter mutation carries: the encounter
 * being written and the single optimistic-concurrency `version` token the write
 * is conditioned on (ADR Decision 3 — the DM is the sole writer, so one
 * `version` column suffices, unlike the per-write-class character envelope).
 * Each encounter `*.schema.ts` extends this with its payload rather than
 * restating the pair inline (the analogue of `character-mutation.schema.ts`).
 *
 * `expectedVersion` is `nonnegative`, not `positive`: a freshly-created
 * encounter starts at version 0, so its first write legitimately sends 0.
 */
export const encounterMutationBase = z.object({
  encounterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
