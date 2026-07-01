import { z } from "zod/v4"

import type { LoadEncounterV2Error } from "@/lib/db/queries/load-encounter-v2"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "../encounter/encounter-mutation.schema"

/**
 * Input schema for the v2 {@link endCombatAction} (UNN-520). Combat-end is a
 * **composed** action over both aggregates (CD16), so the Instance token is
 * required — the overlay sweep writes the session blob and the spatial prune
 * writes the Instance, atomically.
 */
export const EndCombatSchema = encounterMutationBase.extend({
  expectedInstanceVersion: z.number().int().nonnegative(),
})

export type EndCombatInput = z.input<typeof EndCombatSchema>

export type EndCombatError =
  | "invalid-input"
  | "encounter-not-live"
  | "map-instance-not-found"
  | "locator-missing"
  | LoadEncounterV2Error
  | EncounterWriteError
  | MapInstanceWriteError
