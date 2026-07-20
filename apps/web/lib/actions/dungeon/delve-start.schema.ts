import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link startDelveAction} (UNN-464) — the delve-start gesture:
 * snapshot the selected Map's geometry into the Instance, place the party's PC
 * tokens, and flip the dungeon `draft → active`, all in one `guardMany`. The
 * `placements` are the roster the DM staged in the prep console — each a campaign
 * character placed in a starting Zone (keyed by `characterId`, Decision 6, so the
 * turn loop's `actedCharacterIds` roster derives from occupancy). An empty roster
 * is allowed (a partial party is fine — PRD).
 *
 * De-versioned by UNN-657: the authority locks the dungeon row and validates
 * `draft` in-transaction; no client version tokens.
 */
export const StartDelveSchema = z.object({
  dungeonId: z.string(),
  placements: z.array(
    z.object({ characterId: z.string(), zoneId: z.string() })
  ),
})

export type StartDelveInput = z.input<typeof StartDelveSchema>

export type StartDelveError =
  | "invalid-input"
  | "dungeon-not-found"
  | "delve-not-draft"
  | "delve-is-expedition"
  | "campaign-already-has-active-delve"
  | "map-not-found"
  | DungeonWriteError
  | MapInstanceWriteError
