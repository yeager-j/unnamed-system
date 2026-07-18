import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link import("./expedition-start").startExpeditionAction}
 * (UNN-589 D5) — byte-identical to the delve-start wire
 * ({@link import("./delve-start.schema").StartDelveSchema}): the prep screen is
 * shared between the variants, and only the action it dispatches differs.
 */
export const StartExpeditionSchema = z.object({
  dungeonId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  expectedInstanceVersion: z.number().int().nonnegative(),
  placements: z.array(
    z.object({ characterId: z.string(), zoneId: z.string() })
  ),
})

export type StartExpeditionInput = z.input<typeof StartExpeditionSchema>

export type StartExpeditionError =
  | "invalid-input"
  | "dungeon-not-found"
  | "not-an-expedition"
  | "region-not-found"
  | "delve-not-draft"
  | "delve-has-live-encounter"
  | "campaign-already-has-active-delve"
  | "map-not-found"
  | DungeonWriteError
  | MapInstanceWriteError
