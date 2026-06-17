import { z } from "zod/v4"

import { combatantSetupSchema } from "@workspace/game/foundation"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "./encounter-mutation.schema"

/**
 * Input schema for {@link import("./setup").addSetupCombatantsAction} (UNN-347).
 * The shared {@link encounterMutationBase} envelope plus the {@link
 * combatantSetupSchema} combatants to **append** to the persisted session. Unlike
 * the retired bulk roster save, the payload is only the *new* combatants — the
 * action reads the existing roster server-side and appends — so this never
 * rebuilds the session (and so can't wipe the zone graph). The interactive setup
 * surface drives every other edit through `applyCombatEvent`; this batch path
 * exists for the catalog enemy-add sub-route (UNN-346), which commits a queue and
 * navigates away rather than dispatching one event per enemy.
 *
 * `expectedInstanceVersion` is the Map Instance token: each append now
 * cross-writes the Instance an occupancy token (UNN-459), so the batch commits
 * both rows in one `guardMany` transaction.
 */
export const AddSetupCombatantsSchema = encounterMutationBase.extend({
  expectedInstanceVersion: z.number().int().nonnegative(),
  combatants: z.array(combatantSetupSchema),
})

export type AddSetupCombatantsInput = z.input<typeof AddSetupCombatantsSchema>

export type AddSetupCombatantsError =
  | "invalid-input"
  | "map-instance-not-found"
  | EncounterWriteError
  | MapInstanceWriteError
