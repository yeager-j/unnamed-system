import {
  reduceMapInstance as createReduceMapInstance,
  reduceDungeon,
  type DungeonEvent,
  type DungeonState,
  type MapInstanceEvent,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

/**
 * The **one optimistic container** the live DM dungeon **exploration** console
 * reduces — the exploration peer of combat's {@link
 * import("@/domain/combat/console-optimistic").reduceConsoleOptimistic}
 * (UNN-597; the dungeon *combat* phase reuses that combat one). A single
 * `useOptimistic<DungeonConsoleState, DungeonConsoleAction>`
 * over `{ dungeon, instance }`, mirroring exactly what the server actions
 * persist. It collapses the two `useOptimistic` containers the console ran
 * before — the same two-container shape UNN-535 already retired on the combat
 * side. The **two version queues survive** (the `dungeon` and `map_instance`
 * rows still version independently); only the optimistic frame is unified.
 *
 * The action routes to the container owning the row it mirrors — the turn loop
 * (`markActed`/`advanceTurn`) reduces `dungeon` via `reduceDungeon`, every
 * spatial edit reduces `instance` via the client-bound `reduceMapInstance`. The
 * search-that-reveals cross-write is two actions (a `dungeonEvent` markActed +
 * an `instanceEvent` reveal) dispatched back-to-back into the same frame.
 */
export interface DungeonConsoleState {
  dungeon: DungeonState
  instance: MapInstanceState
}

export type DungeonConsoleAction =
  | { kind: "dungeonEvent"; event: DungeonEvent }
  | { kind: "instanceEvent"; event: MapInstanceEvent }

/**
 * Builds the console optimistic reducer around an injected id mint (tests pass a
 * deterministic one). The mint only fires for spatial events that create ids the
 * client didn't supply — console gestures always client-mint, so in practice it's
 * a fallback.
 */
export function createReduceDungeonConsoleOptimistic(newId: () => string) {
  const reduceMapInstance = createReduceMapInstance(newId)

  return (
    state: DungeonConsoleState,
    action: DungeonConsoleAction
  ): DungeonConsoleState => {
    switch (action.kind) {
      case "dungeonEvent":
        return { ...state, dungeon: reduceDungeon(state.dungeon, action.event) }
      case "instanceEvent":
        return {
          ...state,
          instance: reduceMapInstance(state.instance, action.event),
        }
    }
  }
}

const clientNewId = () => crypto.randomUUID()

/** The production reducer the console hands to `useOptimistic`. */
export const reduceDungeonConsoleOptimistic =
  createReduceDungeonConsoleOptimistic(clientNewId)
