import type { z } from "zod/v4"

import { combatEventSchema } from "@workspace/game/encounter"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"

import { encounterMutationBase } from "./encounter-mutation.schema"

/**
 * Input schema for {@link applyCombatEvent} (UNN-332): the shared
 * {@link encounterMutationBase} envelope (encounter id + optimistic-concurrency
 * token) plus the {@link combatEventSchema}-validated event — the wire payload
 * is the *event*, never a client-computed session (ADR Decision 4).
 */
export const ApplyCombatEventSchema = encounterMutationBase.extend({
  event: combatEventSchema,
})

export type ApplyCombatEventInput = z.input<typeof ApplyCombatEventSchema>

/** A `startCombat` is rejected when the campaign already has a live encounter
 *  (UNN-302's single-live guard). */
export type ApplyCombatEventError =
  | "invalid-input"
  | "campaign-already-has-live-encounter"
  | EncounterWriteError
