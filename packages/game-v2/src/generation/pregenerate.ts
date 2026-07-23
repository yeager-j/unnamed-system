import { createDungeonState } from "@workspace/game-v2/spatial/dungeon.schema"
import type { GenerationLedger } from "@workspace/game-v2/spatial/generation-ledger.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import { reduceDungeon } from "@workspace/game-v2/spatial/reduce-dungeon"
import { reduceMapInstance } from "@workspace/game-v2/spatial/reduce-map-instance"

import { rollExpansion } from "./roll-expansion"
import type { TemplateSetContent } from "./template-set.schema"

/**
 * Default **depth** limit for a pre-generated expedition — how many rooms deep
 * (rings out from the entrance) the map carves, the whole thing built at start
 * rather than one room per click (UNN-642, the "replace" experience). Depth is
 * the DM-legible "how deep does this region go"; the resulting *size* follows
 * from the set's branchiness. A feel constant, not schema; a candidate to move
 * onto region settings when regions want to vary their reach.
 */
export const DEFAULT_PREGEN_MAX_DEPTH = 5

/**
 * Defensive absolute ceiling on carved zones. Depth is the real limit, but a
 * hard-branching set at a deep limit could carve a very large (and, via the
 * O(n²) placement search, slow) board; this backstops it. If a map hits the
 * cap, the deepest branches are sealed early — a bounded map, not a hang.
 */
const PREGEN_MAX_ZONES = 250

/**
 * Carves a whole expedition map up front by looping the pure roller over the
 * open frontier, expanding every stub whose parent zone is **shallower than
 * `maxDepth`** (a stub off a max-depth zone would carve one deeper, so it is
 * left to be sealed), then **sealing the remaining frontier** — the leftover
 * open stubs become walls, so the finished map is a complete static board with
 * no dangling ghosts and the player snapshot shows no phantom exits. Depth is
 * measured from the starting zones (BFS rings, stamped at mint as
 * `parent depth + 1`).
 *
 * The per-mint **turn cost is deliberately dropped**: pre-gen happens before
 * play, so the returned ledger records the mints and stream cursors (retract
 * still works at prep) but the caller keeps the dungeon at turn 0 — the
 * throwaway dungeon here only carries the ledger through `reduceDungeon`; its
 * turn counter ticks and is discarded.
 *
 * Among expandable stubs the **shallowest-oldest** goes first (frontier FIFO
 * over the insertion-ordered `generation.stubs` record, which is already
 * roughly depth order), spreading growth breadth-first; combined with the
 * seed-driven draws the whole map is a deterministic function of the seed.
 */
export function pregenerateExpedition(input: {
  set: TemplateSetContent
  instanceState: MapInstanceState
  ledger: GenerationLedger
  maxDepth: number
  newId: () => string
}): { instanceState: MapInstanceState; ledger: GenerationLedger } {
  const reduceInstance = reduceMapInstance(input.newId)
  let instance = input.instanceState
  let dungeon = { ...createDungeonState(), generation: input.ledger }

  const maxIterations = PREGEN_MAX_ZONES * 4
  for (let i = 0; i < maxIterations; i++) {
    if (Object.keys(instance.geometry.zones).length >= PREGEN_MAX_ZONES) break
    // The shallowest open stub whose parent hasn't reached the depth limit;
    // stubs off max-depth zones are skipped (they'll be sealed).
    const stubId = Object.keys(instance.generation.stubs).find((id) => {
      const parentId = instance.generation.stubs[id]!.zoneId
      return (instance.generation.zones[parentId]?.depth ?? 0) < input.maxDepth
    })
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
