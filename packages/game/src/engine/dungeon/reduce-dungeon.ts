import { produce } from "immer"

import type { DungeonEvent } from "@workspace/game/foundation/dungeon/dungeon-event"
import type { DungeonState } from "@workspace/game/foundation/dungeon/state"

/**
 * The pure Dungeon reducer (UNN-463): applies a {@link DungeonEvent} to an
 * immutable {@link DungeonState}, returning the next state. The exploration-time
 * counterpart of {@link reduceCombatSession} / {@link reduceMapInstance} — same
 * conventions: a **decider** (deterministic, no I/O), **Immer**-drafted, and a
 * **grouped exhaustive `switch` with no `default`** so a new {@link DungeonEvent}
 * kind fails to compile here ("not all code paths return a value") until handled.
 *
 * Unlike its siblings it takes **no deps**: it mints no id and consults no
 * `GameData` (the turn loop is self-contained), so it is a plain function, not a
 * curried-deps-first factory — and it is **not** bound in `createGameEngine`; the
 * app imports it directly from `@workspace/game/engine`, as it does the pure
 * selectors.
 *
 * It owns only the temporal turn loop. **Status transitions are not its job** — a
 * Dungeon's `draft → active → done` lifecycle is a row-column write in the action
 * layer (mirroring `setEncounterStatus`), not an event here. The delve **roster**
 * is derived from Map Instance tokens, not stored, so `markActed` records an id
 * unconditionally and {@link activeActedCharacterIds} filters departed characters
 * at read-time.
 */
export function reduceDungeon(
  state: DungeonState,
  event: DungeonEvent
): DungeonState {
  return produce(state, (draft) => {
    switch (event.kind) {
      case "markActed": {
        // Stryker disable next-line ConditionalExpression: equivalent — re-marking an already-acted character pushes a duplicate the read-time roster filter still collapses; the dedup guard keeps the stored list clean but is unobservable downstream.
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
