import { z } from "zod/v4"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for the v2 {@link endCombatAction} (UNN-520; de-versioned by
 * UNN-657). Combat-end is a **composed** action over both aggregates (CD16):
 * the authority locks the Instance then the encounter row and validates
 * liveness in-transaction — no client `expectedVersion`. `ended` is terminal,
 * so a redelivered end is a desired-state no-op.
 */
export const EndCombatSchema = z.object({
  encounterId: z.string().min(1),
})

export type EndCombatInput = z.input<typeof EndCombatSchema>

export type EndCombatError =
  | "invalid-input"
  | "encounter-not-live"
  | "map-instance-not-found"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
