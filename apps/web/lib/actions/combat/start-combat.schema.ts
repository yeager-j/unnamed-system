import { z } from "zod/v4"

import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * `startCombat` as a named command (UNN-657): semantic args only — no client
 * `expectedVersion`. The authority locks the Instance and encounter rows in
 * canonical order and validates the draft→live preconditions in-transaction.
 */
export const StartCombatSchema = z.object({
  encounterId: z.string().min(1),
  advantage: z.enum(COMBAT_ADVANTAGES),
  firstSide: z.enum(COMBAT_SIDES),
})

export type StartCombatInput = z.input<typeof StartCombatSchema>

export type StartCombatError =
  | "invalid-input"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "encounter-ended"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
