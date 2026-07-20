import { z } from "zod/v4"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input for {@link import("./end-combat").endDungeonCombatAction} — the inverse
 * of the Begin (UNN-536, PR11c; de-versioned by UNN-657). One transaction flips
 * the delve's live encounter to `ended`, prunes the shared Instance back to its
 * empty-in-exploration profile, and advances the dungeon turn the fight
 * consumed — three rows locked in the canonical dungeon → mapInstance →
 * encounter order, preconditions validated in-transaction. No client version
 * tokens; a redelivered end is a desired-state no-op that must NOT advance the
 * turn a second time.
 */
export const EndDungeonCombatSchema = z.object({
  encounterId: z.string(),
  dungeonId: z.string(),
})

export type EndDungeonCombatInput = z.input<typeof EndDungeonCombatSchema>
export type EndDungeonCombatError =
  | "invalid-input"
  | "dungeon-not-found"
  | "encounter-not-live"
  | "encounter-not-on-dungeon"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
  | DungeonWriteError
