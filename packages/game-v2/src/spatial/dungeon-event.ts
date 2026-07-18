import { z } from "zod/v4"

import { declarationSchema, mintRecordSchema } from "./generation-ledger.schema"

/**
 * The event vocabulary `reduceDungeon` (PR3) dispatches over — the events that mutate
 * a {@link import("./dungeon.schema").DungeonState}. Two families:
 *
 * - **Turn loop:** `markActed` (a character has taken its one action this dungeon
 *   turn, idempotent) and `advanceTurn` (increment `turnCounter`, clear
 *   `actedCharacterIds`; no payload).
 * - **Draw ledger (UNN-590, D4):** `declareSite` (append a fully resolved
 *   declaration — its `secretIndex` was rolled server-side, D1), `recordMint`
 *   (append the per-mint record + apply its declaration effects + uniqueness),
 *   `revertMint` (replay the recorded inverse; **never rewinds `streamCursors`**),
 *   and `advanceCursors` (the stream-cursor bump every expansion outcome emits —
 *   all three outcomes consumed a roll).
 *
 * Status transitions are **not** here — a Dungeon's lifecycle is a row-column flip in
 * the app layer (mirrors encounter status). The combat-vs-spatial routing predicate is
 * deferred to the consumer boundary (Phase B / C1); v2 routes by parse.
 */
export const dungeonEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("markActed"), characterId: z.string() }),
  z.object({ kind: z.literal("advanceTurn") }),
  z.object({ kind: z.literal("declareSite"), declaration: declarationSchema }),
  z.object({
    kind: z.literal("recordMint"),
    zoneId: z.string(),
    record: mintRecordSchema,
  }),
  z.object({ kind: z.literal("revertMint"), zoneId: z.string() }),
  z.object({
    kind: z.literal("advanceCursors"),
    consumed: z.record(z.string(), z.number().int().positive()),
  }),
])

export type DungeonEvent = z.infer<typeof dungeonEventSchema>

/**
 * The dungeon-side **ledger family** (UNN-590). Exported for the same reason as
 * `GENERATION_INSTANCE_EVENT_KINDS`: the app's generic event path refuses these
 * — a lone `revertMint` without its `retractZone` (or vice versa) breaks D4's
 * pairing invariants, so they only travel inside P3b's dedicated two-row
 * actions.
 */
export const GENERATION_DUNGEON_EVENT_KINDS = [
  "declareSite",
  "recordMint",
  "revertMint",
  "advanceCursors",
] as const satisfies readonly DungeonEvent["kind"][]
