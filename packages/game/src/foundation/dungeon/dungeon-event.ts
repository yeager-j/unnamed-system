import { z } from "zod/v4"

import type { MapInstanceEvent } from "@workspace/game/foundation/encounter/map-instance-event"

/**
 * The event vocabulary {@link import("@workspace/game/engine") reduceDungeon}
 * dispatches over — the events that mutate the exploration turn loop on a
 * {@link import("./state").DungeonState}: marking a character as having acted this
 * turn, and advancing to the next dungeon turn.
 *
 * **Status transitions are not here.** A Dungeon's lifecycle (`draft → active →
 * done`) is a row column flipped in the action layer — exactly as encounter status
 * is a `setEncounterStatus` column write, not a `reduceCombatSession` event — with
 * its cross-row guards (one-active-delve-per-campaign; the live-encounter lifecycle
 * lock) enforced there (UNN-464). A status event in this union would mutate no
 * jsonb state (a fresh Dungeon already holds default turn-loop state), so it would
 * be vestigial.
 *
 * - `markActed` records that `characterId` has taken its one action this dungeon
 *   turn (§2.2). Idempotent — re-marking an already-acted character is a no-op.
 *   The roster-membership filter (a departed character's stale entry) is applied at
 *   read-time by {@link import("@workspace/game/engine") activeActedCharacterIds},
 *   not here, since the roster lives on the Map Instance.
 * - `advanceTurn` ends the current dungeon turn: it increments `turnCounter` and
 *   clears `actedCharacterIds` for the fresh turn. It carries no payload.
 */
export type DungeonEvent =
  | { kind: "markActed"; characterId: string }
  | { kind: "advanceTurn" }

/**
 * Runtime validator for a {@link DungeonEvent} arriving over the wire — the
 * boundary the impure shell (UNN-464) parses an untrusted client payload through
 * before handing it to `reduceDungeon`. Mirrors the hand-written
 * {@link DungeonEvent} union member-for-member; the lockstep assertion below stops
 * the two from drifting. Ships with the reducer (additive), exactly as
 * {@link import("../encounter/map-instance-event").mapInstanceEventSchema} shipped
 * with `reduceMapInstance` before it was wired (UNN-454).
 */
export const dungeonEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("markActed"), characterId: z.string() }),
  z.object({ kind: z.literal("advanceTurn") }),
])

/** `true` only when `A` and `B` are mutually assignable (structurally equal). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/**
 * Compile-time lockstep guard: if {@link dungeonEventSchema} and the hand-written
 * {@link DungeonEvent} union ever diverge, this assignment stops compiling.
 */
const _dungeonEventSchemaInSync: Equals<
  z.infer<typeof dungeonEventSchema>,
  DungeonEvent
> = true
void _dungeonEventSchemaInSync

/**
 * The discriminant `kind`s of every {@link DungeonEvent}. The assertion below
 * proves it covers the union exactly (no kind added or dropped without updating
 * this list).
 */
export const DUNGEON_EVENT_KINDS = ["markActed", "advanceTurn"] as const

const _dungeonEventKindsInSync: Equals<
  (typeof DUNGEON_EVENT_KINDS)[number],
  DungeonEvent["kind"]
> = true
void _dungeonEventKindsInSync

/**
 * Splits the dungeon console's combined event payload into its two reducer paths:
 * narrows a {@link DungeonEvent} (the turn loop, written to the dungeon row) from a
 * {@link MapInstanceEvent} (a spatial move/reveal, written to the Map Instance
 * row), so the Server Action (`applyDungeonEvent`, UNN-464) routes a parsed event
 * to the right reducer + row. The mirror of
 * {@link import("../encounter/map-instance-event").isMapInstanceEvent}; the two
 * unions share no `kind`, so the membership check is unambiguous.
 */
export function isDungeonEvent(
  event: DungeonEvent | MapInstanceEvent
): event is DungeonEvent {
  return (DUNGEON_EVENT_KINDS as readonly string[]).includes(event.kind)
}
