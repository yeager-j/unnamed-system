import { z } from "zod/v4"

import {
  dungeonEventSchema,
  type DungeonEvent,
} from "@workspace/game-v2/spatial"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"

/**
 * Input schema for {@link applyDungeonEvent} (UNN-464): the dungeon id + the
 * dungeon optimistic-concurrency token, plus the event — a union of the turn-loop
 * {@link dungeonEventSchema} (`markActed`/`advanceTurn`, written to the dungeon
 * row) **and** the spatial {@link mapInstanceEventSchema} (a move/reveal, written
 * to the Map Instance row). The action routes on {@link isDungeonEvent} to the
 * right reducer + row, the exploration-time peer of `applyCombatEvent`.
 *
 * Spatial events are intentionally absent: they travel through the Map Instance
 * Replica, leaving this wire with one aggregate and one version token.
 */
export const ApplyDungeonEventSchema = z.object({
  dungeonId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  event: dungeonEventSchema,
})

export type ApplyDungeonEventInput = z.input<typeof ApplyDungeonEventSchema>

export function isDungeonEvent(event: unknown): event is DungeonEvent {
  return dungeonEventSchema.safeParse(event).success
}

/**
 * Routes a wire event to the turn-loop arm. The dungeon and spatial unions share
 * no `kind`, so the discriminated-union parse is effectively a cheap discriminator
 * check ("route by parse, not a hand-maintained kind list" — the v2 doctrine).
 * Declared once beside the wire union it discriminates; the client router and the
 * server action both route through it.
 */
/** The turn-loop path is sealed to active delves. */
export type ApplyDungeonEventError =
  | "invalid-input"
  | "delve-not-active"
  | DungeonWriteError
