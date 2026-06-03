import { z } from "zod/v4"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import { combatEventSchema } from "@/lib/game/encounter"

/**
 * Input schema for {@link applyCombatEvent} (UNN-332). The envelope is the
 * encounter id + the optimistic-concurrency token the caller last saw, plus the
 * {@link combatEventSchema}-validated event — the wire payload is the *event*,
 * never a client-computed session (ADR Decision 4). The `{ encounterId,
 * expectedVersion }` pair is inlined here; extract an `encounterMutationBase`
 * (mirroring `character-mutation.schema.ts`) once a second encounter action
 * lands (UNN-309+).
 */
export const ApplyCombatEventSchema = z.object({
  encounterId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  event: combatEventSchema,
})

export type ApplyCombatEventInput = z.input<typeof ApplyCombatEventSchema>

export type ApplyCombatEventError = "invalid-input" | EncounterWriteError
