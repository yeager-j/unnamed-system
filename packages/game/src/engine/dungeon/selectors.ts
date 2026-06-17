import {
  DUNGEON_DAY_TURNS,
  EXHAUSTION_ONSET_INTERVAL,
  type DungeonState,
} from "@workspace/game/foundation/dungeon/state"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"

/**
 * Pure read-only views over a {@link DungeonState} and its Map Instance — derived
 * state the {@link reduceDungeon} reducer never stores (the encounter-layer
 * counterpart is `selectors.ts`).
 */

/**
 * The delve roster — the characters in the dungeon — **derived** from the Map
 * Instance's occupancy, never stored on the Dungeon (ADR: "placing a token adds a
 * character to the delve"). The occupancy keys are the token ids; in exploration
 * they are the placed characters' ids. (The PC/enemy occupant-union refinement is
 * deferred to combat integration — UNN-464/M4; this stays faithful to the shipped
 * flat token model.)
 */
export function deriveDungeonRoster(instance: MapInstanceState): string[] {
  return Object.keys(instance.occupancy)
}

/**
 * The characters who have acted this dungeon turn, **filtered to the current
 * roster**: a stale `actedCharacterIds` entry for a character who has since left
 * the delve (token removed from the Instance) is ignored at read-time, so the
 * reducer never needs a second write to prune it (ADR — *Reducer topology*). Pass
 * the roster from {@link deriveDungeonRoster}.
 */
export function activeActedCharacterIds(
  state: DungeonState,
  rosterIds: readonly string[]
): string[] {
  const roster = new Set(rosterIds)
  return state.actedCharacterIds.filter((id) => roster.has(id))
}

/**
 * A DM-only reminder nudge the dungeon-turn counter drives (PRD FR-4). Pure read
 * shape — dismissal is component-local UI state downstream, never persisted.
 * `turn` is the turn counter at which the nudge fires (the threshold reached).
 */
export type DungeonReminder =
  | { kind: "random-encounter"; turn: number }
  | { kind: "exhaustion-onset"; turn: number }

/**
 * The reminders firing **at the current `turnCounter`** — pure selectors over the
 * counter, holding no state (PRD FR-4):
 *
 * - **random-encounter**: when enabled, each time the counter reaches a multiple of
 *   the configured interval (turn 0 — the un-started delve — never fires).
 * - **exhaustion-onset**: each +{@link EXHAUSTION_ONSET_INTERVAL}-turn threshold
 *   past the {@link DUNGEON_DAY_TURNS}-turn day (turns 51, 54, 57…) — once per
 *   threshold, never every turn (rulebook §2.2). Always on; no setting.
 *
 * The "once per threshold" property is inherent: the selector fires only when the
 * counter is *exactly* a threshold value, so advancing turn-by-turn surfaces each
 * nudge once.
 */
export function dungeonReminders(state: DungeonState): DungeonReminder[] {
  const { turnCounter, reminderSettings } = state
  const reminders: DungeonReminder[] = []

  const { enabled, intervalTurns } = reminderSettings.randomEncounters
  if (enabled && turnCounter > 0 && turnCounter % intervalTurns === 0) {
    reminders.push({ kind: "random-encounter", turn: turnCounter })
  }

  if (
    turnCounter > DUNGEON_DAY_TURNS &&
    // Stryker disable next-line ArithmeticOperator: equivalent — DUNGEON_DAY_TURNS (48) is a multiple of EXHAUSTION_ONSET_INTERVAL (3), so (t − 48) % 3 ≡ (t + 48) % 3 for every t; the offset's sign is unobservable. Kept as a subtraction because it reads as "turns past the day mark".
    (turnCounter - DUNGEON_DAY_TURNS) % EXHAUSTION_ONSET_INTERVAL === 0
  ) {
    reminders.push({ kind: "exhaustion-onset", turn: turnCounter })
  }

  return reminders
}
