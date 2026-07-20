import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"
import type { RegionWriteError } from "@/lib/db/writes/region"

/**
 * Input schema for {@link import("./expedition-finish").finishExpeditionAction}
 * (UNN-589 D5/D11). The dungeon token is the lifecycle serialization point;
 * the authority locks and freezes the current Instance in the same transaction.
 * The region has no wire token and is read inside the transaction.
 */
export const FinishExpeditionSchema = z.object({
  dungeonId: z.string(),
})

export type FinishExpeditionInput = z.input<typeof FinishExpeditionSchema>

export type FinishExpeditionError =
  | "invalid-input"
  | "dungeon-not-found"
  | "not-an-expedition"
  | "region-not-found"
  | "delve-not-active"
  | "delve-has-live-encounter"
  | DungeonWriteError
  | MapInstanceWriteError
  | RegionWriteError
