import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"
import type { RegionWriteError } from "@/lib/db/writes/region"

/**
 * Input schema for {@link import("./expedition-finish").finishExpeditionAction}
 * (UNN-589 D5/D11). Both client tokens are required: the dungeon token is the
 * lifecycle serialization point, and the Instance token is the **freeze** — no
 * state write rides it, but guarding it is what seals frozen history against an
 * in-flight spatial write. The region has no wire token; its version is
 * server-read inside the transaction (the console never holds one).
 */
export const FinishExpeditionSchema = z.object({
  dungeonId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  expectedInstanceVersion: z.number().int().nonnegative(),
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
