import { z } from "zod/v4"

import {
  dungeonEventSchema,
  mapInstanceEventSchema,
  type DungeonEvent,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link applyDungeonEvent} (UNN-464): the dungeon id + the
 * dungeon optimistic-concurrency token, plus the event — a union of the turn-loop
 * {@link dungeonEventSchema} (`markActed`/`advanceTurn`, written to the dungeon
 * row) **and** the spatial {@link mapInstanceEventSchema} (a move/reveal, written
 * to the Map Instance row). The action routes on {@link isDungeonEvent} to the
 * right reducer + row, the exploration-time peer of `applyCombatEvent`.
 *
 * `expectedInstanceVersion` is the Map Instance's optimistic token; the console
 * holds **both** version tokens (the dungeon row and the Instance row) and sends
 * both. It is optional so a pure dungeon-row write (the turn loop) needn't supply
 * it; the action requires it for the spatial path.
 */
export const ApplyDungeonEventSchema = z.object({
  dungeonId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
  expectedInstanceVersion: z.number().int().nonnegative().optional(),
  event: z.union([dungeonEventSchema, mapInstanceEventSchema]),
})

export type ApplyDungeonEventInput = z.input<typeof ApplyDungeonEventSchema>

/**
 * Routes a wire event to the turn-loop arm. The dungeon and spatial unions share
 * no `kind`, so the discriminated-union parse is effectively a cheap discriminator
 * check ("route by parse, not a hand-maintained kind list" — the v2 doctrine).
 * Declared once beside the wire union it discriminates; the client router and the
 * server action both route through it.
 */
export function isDungeonEvent(
  event: DungeonEvent | MapInstanceEvent
): event is DungeonEvent {
  return dungeonEventSchema.safeParse(event).success
}

/** The spatial path adds the Instance write errors and a `missing-instance-version`
 *  when the console omitted the Instance token a move/reveal needs. */
export type ApplyDungeonEventError =
  | "invalid-input"
  | "missing-instance-version"
  | DungeonWriteError
  | MapInstanceWriteError
