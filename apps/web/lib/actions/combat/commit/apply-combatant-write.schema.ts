import { z } from "zod/v4"

import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"

import type { EntityWriteError } from "@/lib/actions/entity/entity-row-store"
import type { LoadEncounterV2Error } from "@/lib/db/queries/load-encounter-v2"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import { entityWriteSchema } from "@/lib/entity/commit/write.schema"

import { encounterMutationBase } from "../../encounter/encounter-mutation.schema"

/**
 * Input schema for {@link applyCombatantWriteAction} (UNN-520) — the
 * write-router's own wire, carrying the storage-blind
 * {@link entityWriteSchema} descriptor plus the participant it targets.
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
  write: entityWriteSchema,
})

export type ApplyCombatantWriteInput = z.input<typeof ApplyCombatantWriteSchema>

/**
 * The router's error surface: the durable arm's native {@link EntityWriteError}
 * (the shared Writer refusals + the entity guard's `stale`/`entity-not-found` +
 * `entity-load-failed`), the session arm's encounter-write + loader codes, and the
 * router-boundary rejections (`participant-not-found`, `missing-character-version`,
 * `locator-missing`). The session arm's own Writer refusals are covered by
 * `EntityWriteError` too — one write vocabulary, one refusal set.
 */
export type ApplyCombatantWriteError =
  | "invalid-input"
  | "participant-not-found"
  | "missing-character-version"
  | "locator-missing"
  | EntityWriteError
  | LoadEncounterV2Error
  | EncounterWriteError
