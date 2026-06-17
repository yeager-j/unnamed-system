import { reduceDungeon } from "@workspace/game/engine/dungeon/reduce-dungeon"
import type { DungeonEvent } from "@workspace/game/foundation/dungeon/dungeon-event"
import type { DungeonState } from "@workspace/game/foundation/dungeon/state"

/**
 * A {@link DungeonState} for the {@link reduceDungeon} + dungeon-selector tests
 * (UNN-463). Defaults to a fresh delve — turn 0, nobody acted, random encounters
 * off — so a test seeds only the loop state its case reads. Cloned per call (fresh
 * array + nested object) so a mutation in one test can't leak into another. The
 * exploration peer of `makeMapInstanceState`.
 */
export const makeDungeonState = (
  overrides: Partial<DungeonState> = {}
): DungeonState => ({
  turnCounter: 0,
  actedCharacterIds: [],
  reminderSettings: { randomEncounters: { enabled: false, intervalTurns: 6 } },
  ...overrides,
})

/** Applies one {@link DungeonEvent} through the real reducer. */
export const reduceDungeonFix = (
  state: DungeonState,
  event: DungeonEvent
): DungeonState => reduceDungeon(state, event)
