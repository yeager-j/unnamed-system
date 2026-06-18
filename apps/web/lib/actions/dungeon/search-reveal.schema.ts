import { z } from "zod/v4"

import { mapInstanceEventSchema } from "@workspace/game/foundation"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/** The reveal-overlay events a search may fire — the subset of spatial events this
 *  gesture couples with `markActed`. A move/geometry edit is never a "search". */
const REVEAL_EVENT_KINDS = [
  "revealZone",
  "hideZone",
  "revealConnection",
  "hideConnection",
  "unlockConnection",
  "lockConnection",
] as const

/**
 * Input schema for {@link searchRevealAction} (UNN-464, ADR — *Atomicity*; PRD
 * FR-5): the "search-that-reveals" gesture — a character spends their action to
 * Search, the DM reveals what it uncovered, and the two writes commit
 * **atomically** (the Dungeon `markActed` acted-flag + the Instance reveal). The
 * `event` is constrained to a reveal-overlay event (the confirm dialog's "this was
 * a search by [character] → mark them acted" path); a plain reveal with no search
 * is the single-row `applyDungeonEvent` instead.
 */
export const SearchRevealSchema = z.object({
  dungeonId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  expectedInstanceVersion: z.number().int().nonnegative(),
  characterId: z.string(),
  event: mapInstanceEventSchema.refine(
    (event) => (REVEAL_EVENT_KINDS as readonly string[]).includes(event.kind),
    { message: "event must be a reveal-overlay event" }
  ),
})

export type SearchRevealInput = z.input<typeof SearchRevealSchema>

export type SearchRevealError =
  | "invalid-input"
  | "dungeon-not-found"
  | DungeonWriteError
  | MapInstanceWriteError
