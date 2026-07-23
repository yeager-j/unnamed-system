import { createDungeonState } from "@workspace/game-v2/spatial/dungeon.schema"
import type { GenerationLedger } from "@workspace/game-v2/spatial/generation-ledger.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import { reduceDungeon } from "@workspace/game-v2/spatial/reduce-dungeon"
import { reduceMapInstance } from "@workspace/game-v2/spatial/reduce-map-instance"

import { rollExpansion } from "./roll-expansion"
import type { TemplateSetContent } from "./template-set.schema"

/**
 * Default target zone count for a **pre-generated** expedition — the whole map
 * carved at start rather than one room per click (UNN-642, the "replace"
 * experience). A feel constant, not schema; a candidate to move onto region
 * settings when regions want to vary their size. Counts every zone on the
 * instance, authored seed zones included.
 */
export const DEFAULT_PREGEN_ZONE_TARGET = 30

/**
 * Carves a whole expedition map up front by looping the pure roller over the
 * open frontier until the instance reaches `zoneTarget` zones (or the frontier
 * naturally dries), folding every outcome through the shared reducers, then
 * **sealing the remaining frontier** — the leftover open stubs become walls, so
 * the finished map is a complete static board with no dangling ghosts and the
 * player snapshot shows no phantom exits.
 *
 * The per-mint **turn cost is deliberately dropped**: pre-gen happens before
 * play, so the returned ledger records the mints and stream cursors (retract
 * still works at prep) but the caller keeps the dungeon at turn 0 — the
 * throwaway dungeon here only carries the ledger through `reduceDungeon`; its
 * turn counter ticks and is discarded.
 *
 * Stubs expand **oldest-first** (frontier FIFO over the insertion-ordered
 * `generation.stubs` record), which spreads growth breadth-first; combined with
 * the seed-driven draws the whole map is a deterministic function of the seed.
 * A seed whose frontier dead-ends before the target yields a smaller map;
 * starting a fresh expedition re-rolls the seed.
 */
export function pregenerateExpedition(input: {
  set: TemplateSetContent
  instanceState: MapInstanceState
  ledger: GenerationLedger
  zoneTarget: number
  newId: () => string
}): { instanceState: MapInstanceState; ledger: GenerationLedger } {
  const reduceInstance = reduceMapInstance(input.newId)
  let instance = input.instanceState
  let dungeon = { ...createDungeonState(), generation: input.ledger }

  // Defensive bound: every outcome consumes a stub, so the frontier can only
  // outgrow the target so fast — but cap the loop regardless of the set.
  const maxIterations = input.zoneTarget * 20
  for (let i = 0; i < maxIterations; i++) {
    if (Object.keys(instance.geometry.zones).length >= input.zoneTarget) break
    const stubId = Object.keys(instance.generation.stubs)[0]
    if (stubId === undefined) break

    const rolled = rollExpansion({
      set: input.set,
      instanceState: instance,
      ledger: dungeon.generation,
      stubId,
      newId: input.newId,
    })
    if (!rolled.ok) {
      // Only reachable on corrupt state (a dangling stub); drop it as a dead
      // end so the loop can't spin on the same stub.
      instance = reduceInstance(instance, { kind: "resolveDeadEnd", stubId })
      continue
    }
    for (const event of rolled.value.instanceEvents) {
      instance = reduceInstance(instance, event)
    }
    for (const event of rolled.value.dungeonEvents) {
      dungeon = reduceDungeon(dungeon, event)
    }
  }

  // Seal the frontier: a pre-generated map is complete.
  return {
    instanceState:
      Object.keys(instance.generation.stubs).length === 0
        ? instance
        : {
            ...instance,
            generation: { ...instance.generation, stubs: {} },
          },
    ledger: dungeon.generation,
  }
}
