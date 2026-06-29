import { z } from "zod/v4"

/**
 * A **Dungeon**'s lifecycle status. `draft` while the DM preps the delve, `active`
 * once it is running, `done` when it has wrapped. Owned in the game domain so the
 * engine never depends on the persistence layer; the `dungeon` table imports this
 * for its `status` column. The transition itself is a **row-column flip** in the app
 * layer, not a reduce event (mirrors encounter status).
 */
export type DungeonStatus = "draft" | "active" | "done"

/**
 * The length of a normal dungeon day, in dungeon turns — ~8 hours at ~10 min per
 * turn (rulebook §2.2). Turns past this incur Exhaustion; the reminder selectors
 * (PR3) use it as the Exhaustion-onset baseline.
 */
export const DUNGEON_DAY_TURNS = 48

/**
 * The first dungeon turn on which Exhaustion accrues — the turn immediately past the
 * {@link DUNGEON_DAY_TURNS}-turn day (rulebook §2.2: "Beginning on the 49th turn…").
 */
export const EXHAUSTION_ONSET_TURN = DUNGEON_DAY_TURNS + 1

/**
 * The cadence, in dungeon turns, at which Exhaustion re-accrues from
 * {@link EXHAUSTION_ONSET_TURN} — one level per additional half-hour (3 turns), so
 * the onset reminder fires at turns 49, 52, 55….
 */
export const EXHAUSTION_ONSET_INTERVAL = 3

/**
 * The interval, in **dungeon turns** (the loop's native unit), at which the
 * random-encounter reminder fires — the `10m / 20m / 30m / 1h` choices map to
 * `1 / 2 / 3 / 6` turns. A ~10-minute dungeon turn is the base.
 */
export const randomEncounterIntervalSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(6),
])
export type RandomEncounterInterval = z.infer<
  typeof randomEncounterIntervalSchema
>

/**
 * The DM-only reminder settings persisted on a Dungeon. The reminders themselves are
 * **pure selectors over the turn counter** (PR3) — the only persisted setting is the
 * random-encounter cadence; Exhaustion-onset is always-on with no setting. Structured
 * as an object so more reminders can grow their own settings without reshaping the column.
 */
export const reminderSettingsSchema = z.object({
  randomEncounters: z
    .object({
      enabled: z.boolean().default(false),
      intervalTurns: randomEncounterIntervalSchema.default(6),
    })
    .default({ enabled: false, intervalTurns: 6 }),
})
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>

/**
 * The **Dungeon** state — the exploration-time turn loop the Dungeon Map feature
 * layers over a Map-Instance. Re-declared in v2 as pure Zod (D32). Persisted as one
 * versioned jsonb blob; the `version` is a row column, never part of this shape.
 *
 * It owns **no** geography — that is the Map-Instance's. It holds only the temporal
 * loop state: `turnCounter` (dungeon turns elapsed, ~10 min each) and
 * `actedCharacterIds` (which characters have acted *this* turn). The delve roster is
 * **derived** from the Instance's PC tokens, not stored here. Every field
 * `.default()`s so a freshly-minted Dungeon parses.
 */
export const dungeonStateSchema = z.object({
  turnCounter: z.number().int().nonnegative().default(0),
  actedCharacterIds: z.array(z.string()).default([]),
  reminderSettings: reminderSettingsSchema.default({
    randomEncounters: { enabled: false, intervalTurns: 6 },
  }),
})
export type DungeonState = z.infer<typeof dungeonStateSchema>

/**
 * The state a freshly-minted Dungeon is born with — turn 0, nobody has acted,
 * reminders off — produced by running {@link dungeonStateSchema}'s defaults. The one
 * place the initial blob is defined, so the create write never hand-rolls the shape.
 * It takes no deps (the turn loop consults no `GameData`), so it stays a plain factory.
 */
export function createDungeonState(): DungeonState {
  return dungeonStateSchema.parse({})
}
