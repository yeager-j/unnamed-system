import { z } from "zod/v4"

import {
  dungeonEventSchema,
  type DungeonEvent,
} from "@workspace/game-v2/spatial"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"

/**
 * Input schema for {@link applyDungeonEvent} (UNN-464; de-versioned by
 * UNN-657): the dungeon id plus the turn-loop event
 * ({@link dungeonEventSchema} — `markActed`/`advanceTurn`, written to the
 * dungeon row). Spatial events are intentionally absent: they travel through
 * the Map Instance Replica.
 *
 * No client version token. `advanceTurn` instead carries `expectedTurn` — the
 * turn the DM was looking at when they advanced, a SEMANTIC precondition
 * (exactly like the Encounter mutations' expected frames): a duplicate or
 * raced advance finds the locked counter already past it and refuses
 * `turn-already-advanced`, which the console treats as quiet convergence.
 * `markActed` is a desired-state fold (an already-acted id no-ops) and needs
 * no precondition.
 */
export const ApplyDungeonEventSchema = z
  .object({
    dungeonId: z.string(),
    event: dungeonEventSchema,
    expectedTurn: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) =>
      data.event.kind !== "advanceTurn" || data.expectedTurn !== undefined,
    { message: "advanceTurn requires expectedTurn" }
  )

export type ApplyDungeonEventInput = z.input<typeof ApplyDungeonEventSchema>

export function isDungeonEvent(event: unknown): event is DungeonEvent {
  return dungeonEventSchema.safeParse(event).success
}

/** The turn-loop path is sealed to active delves. */
export type ApplyDungeonEventError =
  | "invalid-input"
  | "delve-not-active"
  | "turn-already-advanced"
  | DungeonWriteError
