import { z } from "zod/v4"

import { combatantSetupSchema } from "@workspace/game/foundation"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"

import { encounterMutationBase } from "./encounter-mutation.schema"

/**
 * Input schema for {@link import("./setup").saveEncounterSetupAction} (UNN-302).
 * The shared {@link encounterMutationBase} envelope plus the assembled
 * {@link combatantSetupSchema} roster the setup panels built. Unlike
 * `applyCombatEvent`, the wire payload here is the *setup data* (not a live
 * event): a draft's roster is bulk-persisted on explicit save, and the action
 * builds the canonical `CombatSession` server-side via `createCombatSession`.
 */
export const SaveEncounterSetupSchema = encounterMutationBase.extend({
  combatants: z.array(combatantSetupSchema),
})

export type SaveEncounterSetupInput = z.input<typeof SaveEncounterSetupSchema>

export type SaveEncounterSetupError = "invalid-input" | EncounterWriteError
