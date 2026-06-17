import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"

/**
 * Input schema for {@link import("./status").setDungeonStatusAction} (UNN-465): the
 * dungeon id, the target lifecycle `status`, and the optimistic-concurrency token.
 * `draft` is omitted from the target union — a dungeon is born `draft` and only
 * ever moves forward (`active`/`done`), so there is no "set back to draft" path.
 */
export const SetDungeonStatusSchema = z.object({
  dungeonId: z.string(),
  status: z.enum(["active", "done"]),
  expectedVersion: z.number().int().nonnegative(),
})

export type SetDungeonStatusInput = z.input<typeof SetDungeonStatusSchema>

/** Transition fails on a bad payload, the guarded-write errors (`stale` /
 *  `dungeon-not-found`), or the one-active-delve guard. */
export type SetDungeonStatusError =
  | "invalid-input"
  | "campaign-already-has-active-delve"
  | DungeonWriteError
