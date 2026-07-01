import { z } from "zod/v4"

import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"

import { combatantWriteSchema } from "@/lib/combat/commit/write.schema"
import type { CombatantWriteRefusal } from "@/lib/combat/commit/writers"
import type { LoadEncounterForWriteError } from "@/lib/db/queries/load-encounter-v2"
import type {
  AdjustPoolPersistenceError,
  UsePrismaPersistenceError,
} from "@/lib/db/writes/adjust-pools"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

import { encounterMutationBase } from "../../encounter/encounter-mutation.schema"

/**
 * Input schema for {@link applyCombatantWriteAction} (UNN-520) — the
 * write-router's own wire, carrying the storage-blind
 * {@link combatantWriteSchema} descriptor plus the participant it targets.
 * **No storage claim rides here**: the server derives the home from its own
 * locator map, so a tampered client cannot route a durable write through the
 * session arm or vice versa.
 *
 * Two version tokens, one per possible home: `expectedVersion` is the
 * encounter row's (the session arm's guard); `expectedCharacterVersion` is the
 * character row's `vitalsVersion` (the durable arm's guard) — optional so a
 * write the client believes ephemeral needn't fetch one, and **required by the
 * action** when the locator resolves durable.
 */
export const ApplyCombatantWriteSchema = encounterMutationBase.extend({
  participantId: participantIdSchema,
  expectedCharacterVersion: z.number().int().nonnegative().optional(),
  write: combatantWriteSchema,
})

export type ApplyCombatantWriteInput = z.input<typeof ApplyCombatantWriteSchema>

/**
 * The router's error surface: the Writer refusals, the two homes' own
 * persistence errors (each wrapper keeps its v1 codes), the loader's
 * data-integrity codes, and the router-boundary rejections
 * (`participant-not-found`, `missing-character-version`,
 * `unsupported-durable-write`, `locator-missing`).
 */
export type ApplyCombatantWriteError =
  | "invalid-input"
  | "participant-not-found"
  | "missing-character-version"
  | "unsupported-durable-write"
  | "locator-missing"
  | CombatantWriteRefusal
  | LoadEncounterForWriteError
  | EncounterWriteError
  | AdjustPoolPersistenceError
  | UsePrismaPersistenceError
  | MechanicPersistenceError
