import { z } from "zod/v4"

import {
  dungeonEventSchema,
  GENERATION_DUNGEON_EVENT_KINDS,
  GENERATION_INSTANCE_EVENT_KINDS,
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

const GENERATION_EVENT_KINDS: ReadonlySet<string> = new Set([
  ...GENERATION_INSTANCE_EVENT_KINDS,
  ...GENERATION_DUNGEON_EVENT_KINDS,
])

/**
 * True for the UNN-590 generation family — kinds the generic single-row path
 * **refuses** (`generation-event-not-supported`): a generation event is only
 * sound inside its paired two-row `guardMany` (a `mintZone` without its
 * `recordMint`/`advanceCursors`, or a `revertMint` without its `retractZone`,
 * breaks D4's pairing invariants and D11's combined-lane client contract). P3b
 * ships the dedicated expand/retract actions; until then — and after — this
 * door stays shut. The kind sets are engine-exported next to the unions, so a
 * vocabulary grown there cannot silently open a hole here.
 */
export function isGenerationEventKind(
  event: DungeonEvent | MapInstanceEvent
): boolean {
  return GENERATION_EVENT_KINDS.has(event.kind)
}

/** The spatial path adds the Instance write errors, a `missing-instance-version`
 *  when the console omitted the Instance token a move/reveal needs, and a
 *  `character-not-in-campaign` when a `placeCombatant` names a character not
 *  finalized-placed in this campaign (UNN-487). `delve-not-active` is the D11
 *  status seal — the event vocabulary writes only running delves;
 *  `generation-event-not-supported` is {@link isGenerationEventKind}'s refusal. */
export type ApplyDungeonEventError =
  | "invalid-input"
  | "missing-instance-version"
  | "character-not-in-campaign"
  | "delve-not-active"
  | "generation-event-not-supported"
  | DungeonWriteError
  | MapInstanceWriteError
