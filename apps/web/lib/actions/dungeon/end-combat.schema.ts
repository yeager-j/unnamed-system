import { z } from "zod/v4"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input for {@link import("./end-combat").endDungeonCombatAction} — the inverse of
 * the Begin (UNN-536, PR11c). One transaction flips the delve's live encounter to
 * `ended`, prunes the shared Instance back to its empty-in-exploration profile, and
 * advances the dungeon turn the fight consumed, so it guards **three** rows: the
 * encounter, its Map Instance, and the dungeon.
 */
export const EndDungeonCombatSchema = z.object({
  encounterId: z.string(),
  dungeonId: z.string(),
  expectedEncounterVersion: z.number().int().nonnegative(),
  expectedDungeonVersion: z.number().int().nonnegative(),
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
