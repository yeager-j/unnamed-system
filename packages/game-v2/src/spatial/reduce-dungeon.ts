import { produce } from "immer"

import type { DungeonEvent } from "./dungeon-event"
import {
  EXHAUSTION_ONSET_INTERVAL,
  EXHAUSTION_ONSET_TURN,
  type DungeonState,
} from "./dungeon.schema"
import type { MapInstanceState } from "./map-instance.schema"

/**
 * The pure **Dungeon** reducer + its derived read selectors (ADR §2.8/SD11; re-homed
 * from v1 `engine/dungeon/{reduce-dungeon,selectors}.ts`, PRESERVE). The
 * exploration-time turn loop — the standalone proof that spatial stands alone:
 * `reduceDungeon` + `reduceMapInstance` + `reduceMapGeometry` are a complete
 * exploration engine with no `Session`, no `CombatEvent`, no overlay.
 */

/**
 * Applies a {@link DungeonEvent} to an immutable {@link DungeonState}. Same
 * conventions as its reducer siblings — a **decider** (deterministic, no I/O),
 * **Immer**-drafted, a **grouped exhaustive `switch` with no `default`** (a new kind
 * fails to compile until handled), and same-ref no-op on `markActed` for an
 * already-acted id.
 *
 * Unlike `reduceMapInstance` it takes **no deps** (it mints no id, consults no
 * `GameData`), so it is a plain function, not a curried factory — and it is **not**
 * bound in the composition root; callers import it directly. It owns only the
 * temporal loop: **status transitions are a row-column flip in the app layer**, not
 * an event here. The delve **roster** is derived ({@link deriveDungeonRoster}), not
 * stored, so `markActed` records an id unconditionally and {@link
 * activeActedCharacterIds} filters departed characters at read-time.
 */
export function reduceDungeon(
  state: DungeonState,
  event: DungeonEvent
): DungeonState {
  switch (event.kind) {
    case "markActed":
    case "advanceTurn":
      return reduceTurnLoopEvent(state, event)

    case "declareSite":
    case "recordMint":
    case "revertMint":
    case "advanceCursors":
      return reduceLedgerEvent(state, event)
  }
}

type TurnLoopEvent = Extract<
  DungeonEvent,
  { kind: "markActed" | "advanceTurn" }
>
type LedgerEvent = Extract<
  DungeonEvent,
  { kind: "declareSite" | "recordMint" | "revertMint" | "advanceCursors" }
>

/** Turn-loop slice — the original PR3 pair, unchanged in behavior. */
function reduceTurnLoopEvent(
  state: DungeonState,
  event: TurnLoopEvent
): DungeonState {
  return produce(state, (draft) => {
    switch (event.kind) {
      case "markActed": {
        if (draft.actedCharacterIds.includes(event.characterId)) return
        draft.actedCharacterIds.push(event.characterId)
        return
      }

      case "advanceTurn": {
        draft.turnCounter += 1
        draft.actedCharacterIds = []
        return
      }
    }
  })
}

/**
 * Draw-ledger slice (UNN-590, D4). Every payload is fully resolved (D1); the
 * reducer replays deterministically. Contracts:
 *
 * - **Idempotent retries:** `declareSite` on an existing declaration id,
 *   `recordMint` on an already-minted zone, and `revertMint` on an absent record
 *   are same-ref no-ops (the D8 benign-retry contract).
 * - **`revertMint` replays the recorded inverse** from `mints[zoneId]`: releases
 *   the unique key iff the record entered one, and per recorded effect decrements
 *   that declaration's `qualifyingCount` / clears its `resolvedZoneId` (re-arming
 *   the draw). Declarations created after the mint — or resolved by later mints —
 *   are untouched, which is what makes non-LIFO retract sound; aggregate counts
 *   could not recover this.
 * - **`streamCursors` only ever advance** — `revertMint` touches them on no path;
 *   a re-expand after retract consumes fresh positions and rolls a different
 *   result (the escape hatch must escape).
 */
function reduceLedgerEvent(
  state: DungeonState,
  event: LedgerEvent
): DungeonState {
  return produce(state, (draft) => {
    const ledger = draft.generation
    switch (event.kind) {
      case "declareSite": {
        if (ledger.declarations.some((d) => d.id === event.declaration.id)) {
          return
        }
        ledger.declarations.push(event.declaration)
        return
      }

      case "recordMint": {
        if (ledger.mints[event.zoneId] !== undefined) return
        ledger.mints[event.zoneId] = event.record
        if (
          event.record.unique &&
          !ledger.mintedUniqueKeys.includes(event.record.templateKey)
        ) {
          ledger.mintedUniqueKeys.push(event.record.templateKey)
        }
        for (const effect of event.record.effects) {
          const declaration = ledger.declarations.find(
            (d) => d.id === effect.declarationId
          )
          // A withdrawn declaration is skipped — the recorded effect still
          // documents what the mint did at the time (revert skips it the same way).
          if (declaration === undefined) continue
          if (effect.incremented) declaration.qualifyingCount += 1
          if (effect.resolved) declaration.resolvedZoneId = event.zoneId
        }
        return
      }

      case "revertMint": {
        const record = ledger.mints[event.zoneId]
        if (record === undefined) return
        if (record.unique) {
          const index = ledger.mintedUniqueKeys.indexOf(record.templateKey)
          if (index !== -1) ledger.mintedUniqueKeys.splice(index, 1)
        }
        for (const effect of record.effects) {
          const declaration = ledger.declarations.find(
            (d) => d.id === effect.declarationId
          )
          if (declaration === undefined) continue
          if (effect.incremented) {
            declaration.qualifyingCount = Math.max(
              0,
              declaration.qualifyingCount - 1
            )
          }
          if (effect.resolved && declaration.resolvedZoneId === event.zoneId) {
            delete declaration.resolvedZoneId
          }
        }
        delete ledger.mints[event.zoneId]
        return
      }

      case "advanceCursors": {
        for (const [purpose, n] of Object.entries(event.consumed)) {
          ledger.streamCursors[purpose] =
            (ledger.streamCursors[purpose] ?? 0) + n
        }
        return
      }
    }
  })
}

/**
 * The delve roster — the characters in the dungeon — **derived** from the Map-Instance
 * occupancy, never stored on the Dungeon (SD11: "placing a token adds a character to
 * the delve"). The occupancy keys are the token keys; in exploration they are the
 * placed characters' `characterId`s.
 */
export function deriveDungeonRoster(mapInstance: MapInstanceState): string[] {
  return Object.keys(mapInstance.occupancy)
}

/**
 * The characters who have acted this dungeon turn, **filtered to the current
 * roster**: a stale `actedCharacterIds` entry for a character who has since left the
 * delve (token removed from the Instance) is ignored at read-time, so the reducer
 * never needs a second write to prune it. Pass the roster from {@link
 * deriveDungeonRoster}.
 */
export function activeActedCharacterIds(
  state: DungeonState,
  rosterIds: readonly string[]
): string[] {
  const roster = new Set(rosterIds)
  return state.actedCharacterIds.filter((id) => roster.has(id))
}

/**
 * A DM-only reminder nudge the dungeon-turn counter drives. Pure read shape —
 * dismissal is component-local UI state downstream, never persisted. `turn` is the
 * turn counter at which the nudge fires (the threshold reached).
 */
export type DungeonReminder =
  | { kind: "random-encounter"; turn: number }
  | { kind: "exhaustion-onset"; turn: number }

/**
 * The reminders firing **at the current `turnCounter`** — pure selectors over the
 * counter, holding no state:
 *
 * - **random-encounter**: when enabled, each time the counter reaches a multiple of
 *   the configured interval (turn 0 — the un-started delve — never fires).
 * - **exhaustion-onset**: from {@link EXHAUSTION_ONSET_TURN} (the turn past the day)
 *   on each +{@link EXHAUSTION_ONSET_INTERVAL}-turn cadence (turns 49, 52, 55…) —
 *   once per threshold, never every turn (rulebook §2.2). Always on; no setting.
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
    turnCounter >= EXHAUSTION_ONSET_TURN &&
    (turnCounter - EXHAUSTION_ONSET_TURN) % EXHAUSTION_ONSET_INTERVAL === 0
  ) {
    reminders.push({ kind: "exhaustion-onset", turn: turnCounter })
  }

  return reminders
}
