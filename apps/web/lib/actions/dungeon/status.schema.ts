import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link import("./status").setDungeonStatusAction} (UNN-465;
 * de-versioned by UNN-657): the dungeon id and the target lifecycle `status` —
 * a desired-state command. `draft` is omitted from the target union — a
 * dungeon is born `draft` and only ever moves forward (`active`/`done`), so
 * there is no "set back to draft" path. The authority locks the dungeon row
 * and validates the legal transition in-transaction; a redelivered flip whose
 * target already holds is an `ok` no-op.
 */
export const SetDungeonStatusSchema = z.object({
  dungeonId: z.string(),
  status: z.enum(["active", "done"]),
})

export type SetDungeonStatusInput = z.input<typeof SetDungeonStatusSchema>

/** Transition fails on a bad payload, the guarded-write errors, the
 *  one-active-delve guard, an illegal transition caught on the locked row
 *  (D11), a live encounter on the delve's Instance (an ordinary finish must
 *  not freeze the board under a fight — the expedition finish's same check),
 *  or the variant seal — a Region expedition must go through
 *  `startExpeditionAction` / `finishExpeditionAction`. */
export type SetDungeonStatusError =
  | "invalid-input"
  | "campaign-already-has-active-delve"
  | "delve-is-expedition"
  | "delve-not-draft"
  | "delve-not-active"
  | "delve-has-live-encounter"
  | DungeonWriteError
  | MapInstanceWriteError
