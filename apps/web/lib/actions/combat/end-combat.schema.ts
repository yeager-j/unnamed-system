import { z } from "zod/v4"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "../encounter/encounter-mutation.schema"

/**
 * Input schema for the v2 {@link endCombatAction} (UNN-520). Combat-end is a
 * **composed** action over both aggregates (CD16). The wire guards the encounter;
 * the authority locks the current Instance before applying the spatial prune.
 */
export const EndCombatSchema = encounterMutationBase

export type EndCombatInput = z.input<typeof EndCombatSchema>

export type EndCombatError =
  | "invalid-input"
  | "encounter-not-live"
  | "map-instance-not-found"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
