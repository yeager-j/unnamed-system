import { z } from "zod/v4"

import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"

import { combatEntityWriteSchema } from "@/domain/entity/commit/write.schema"
import type { EntityWriteError } from "@/lib/actions/entity/entity-row-store"
import type { LoadEncounterV2Error } from "@/lib/db/queries/load-encounter-v2"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"

/**
 * Input schema for {@link applyCombatantWriteAction} (UNN-520; UNN-567) — the
 * write-router's own wire, carrying the storage-blind
 * {@link combatEntityWriteSchema} descriptor (the combat-relevant subset of the
 * entity write vocabulary — the character-only creation families reject at this
 * boundary, UNN-556) plus the participant it targets. **No storage claim rides
 * here for routing or auth**: the server derives the home from its own locator
 * map, so a tampered client cannot route a durable write through the session
 * arm or vice versa.
 *
 * Two version tokens, one per possible home, **each optional on the wire and
 * required by its own arm** (UNN-567 — no token rides as a passenger):
 * `expectedVersion` is the encounter row's (the session arm refuses
 * `missing-encounter-version` without it); `expectedCharacterVersion` is the
 * entity row's `vitalsVersion` (the durable arm refuses
 * `missing-character-version`). Sending a token is the client's belief made
 * harmless — a wrong belief about the storage home can only fail closed,
 * never mis-route.
 */
export const ApplyCombatantWriteSchema = z.object({
  encounterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
  expectedCharacterVersion: z.number().int().nonnegative().optional(),
  participantId: participantIdSchema,
  write: combatEntityWriteSchema,
})

export type ApplyCombatantWriteInput = z.input<typeof ApplyCombatantWriteSchema>

/**
 * The router's error surface: the durable arm's native {@link EntityWriteError}
 * (the shared Writer refusals + the entity guard's `stale`/`entity-not-found` +
 * `entity-load-failed`), the session arm's encounter-write + loader codes, and
 * the router-boundary rejections (`participant-not-found`, the per-arm
 * `missing-encounter-version` / `missing-character-version`, `locator-missing`).
 * The session arm's own Writer refusals are covered by `EntityWriteError` too —
 * one write vocabulary, one refusal set.
 */
export type ApplyCombatantWriteError =
  | "invalid-input"
  | "participant-not-found"
  | "missing-encounter-version"
  | "missing-character-version"
  | "locator-missing"
  | EntityWriteError
  | LoadEncounterV2Error
  | EncounterWriteError
