import { z } from "zod/v4"

import { combatEventSchema } from "@workspace/game/foundation"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"

/**
 * Input schema for {@link applyOwnCombatEvent}. Keyed on the encounter's **public
 * `shortId`**, not the internal UUID — the player watch view is a public surface
 * that never receives the internal id (the snapshot loader's redaction contract).
 * Carries the optimistic-concurrency `expectedVersion` and a
 * {@link combatEventSchema}-validated event; the event-kind allow-list (overlay
 * edits only) and the per-combatant owner check are enforced in the action.
 */
export const ApplyOwnCombatEventSchema = z.object({
  shortId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  event: combatEventSchema,
})

export type ApplyOwnCombatEventInput = z.input<typeof ApplyOwnCombatEventSchema>

/** A non-overlay event kind, or a malformed payload, lands as `invalid-input`;
 *  `stale` / `encounter-not-found` come from the version-guarded write. (Auth
 *  failures trip `forbidden()` — HTTP 403 — and never surface as a Result error.) */
export type ApplyOwnCombatEventError = "invalid-input" | EncounterWriteError
