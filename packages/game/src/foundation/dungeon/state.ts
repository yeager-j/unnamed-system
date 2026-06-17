import { z } from "zod/v4"

/**
 * A **Dungeon**'s lifecycle status. `draft` while the DM preps the delve, `active`
 * once it is running, `done` when it has wrapped. Owned here (the game domain)
 * rather than inferred from the `dungeon` table, so the engine never depends on
 * the persistence layer; `lib/db/schema/dungeon` imports this for its `status`
 * column — exactly as {@link import("../encounter/status").EncounterStatus} backs
 * the encounter table. See `docs/dungeon-map/ADR.md`.
 */
export type DungeonStatus = "draft" | "active" | "done"

/**
 * The length of a normal dungeon day, in dungeon turns — ~8 hours at ~10 min per
 * turn (rulebook §2.2). Turns past this incur Exhaustion; the reminder selectors
 * (UNN-463) use it as the Exhaustion-onset baseline.
 */
export const DUNGEON_DAY_TURNS = 48

/**
 * The cadence, in dungeon turns, at which Exhaustion accrues past
 * {@link DUNGEON_DAY_TURNS} — one level per additional half-hour (3 turns), so the
 * onset reminder fires at turns 51, 54, 57… (rulebook §2.2; PRD FR-4).
 */
export const EXHAUSTION_ONSET_INTERVAL = 3

/**
 * The interval, in **dungeon turns** (the loop's native unit), at which the
 * random-encounter reminder fires — the PRD's `10m / 20m / 30m / 1h` choices map
 * to `1 / 2 / 3 / 6` turns (PRD FR-4). A ~10-minute dungeon turn is the base.
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
 * The DM-only reminder settings persisted on a Dungeon (PRD FR-4). The reminders
 * themselves are **pure selectors over the turn counter** (UNN-463) — the only
 * persisted setting is the random-encounter cadence; Exhaustion-onset is
 * always-on with no setting, so it has no field here. Structured as an object so
 * more reminders can grow their own settings later without reshaping the column.
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
 * layers over a Map Instance (Dungeon Map ADR, *The four-entity model*). Persisted
 * as one versioned jsonb blob on the `dungeon` row, exactly as a
 * {@link import("../encounter/session").CombatSession} persists on the encounter
 * row and a {@link import("../encounter/map-instance").MapInstanceState} on the
 * Instance: the `version` is a row column, never part of this shape.
 *
 * It owns **no** geography — that is the Map Instance's. It holds only the
 * temporal loop state: `turnCounter` (dungeon turns elapsed, ~10 min each) and
 * `actedCharacterIds` (which characters have acted *this* turn — distinct from the
 * encounter's per-combatant `hasActedThisRound`; a character never acts in both at
 * once). The delve roster is **derived** from the Instance's PC tokens, not stored
 * here. Every field `.default()`s so a freshly-minted Dungeon parses.
 *
 * The turn-loop reducer ({@link import("@workspace/game/engine") reduceDungeon})
 * and the reminder selectors arrive in UNN-463; this is the column contract they
 * share.
 */
export const dungeonStateSchema = z.object({
  turnCounter: z.number().int().nonnegative().default(0),
  actedCharacterIds: z.array(z.string()).default([]),
  reminderSettings: reminderSettingsSchema.default({
    randomEncounters: { enabled: false, intervalTurns: 6 },
  }),
})
export type DungeonState = z.infer<typeof dungeonStateSchema>
