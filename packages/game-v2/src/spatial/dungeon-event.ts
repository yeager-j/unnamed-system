import { z } from "zod/v4"

/**
 * The event vocabulary `reduceDungeon` (PR3) dispatches over — the events that mutate
 * the exploration turn loop on a {@link import("./dungeon.schema").DungeonState}:
 * `markActed` (a character has taken its one action this dungeon turn, idempotent) and
 * `advanceTurn` (increment `turnCounter`, clear `actedCharacterIds`; no payload).
 *
 * Status transitions are **not** here — a Dungeon's lifecycle is a row-column flip in
 * the app layer (mirrors encounter status). The combat-vs-spatial routing predicate is
 * deferred to the consumer boundary (Phase B / C1); v2 routes by parse.
 */
export const dungeonEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("markActed"), characterId: z.string() }),
  z.object({ kind: z.literal("advanceTurn") }),
])

export type DungeonEvent = z.infer<typeof dungeonEventSchema>
