import { gameData } from "@workspace/game-v2/catalog"
import {
  applyInventoryMutation,
  resolveBasicAttack,
  resolveInventory,
  type IntrinsicAttack,
  type InventoryItemState,
  type InventoryMutation,
} from "@workspace/game-v2/items"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { createResolve, createResolveEntity } from "@workspace/game-v2/resolve"

/**
 * The **composition root** (D33, the `createGameEngine` equivalent): the one place
 * that binds the concrete {@link gameData} catalog adapter into the engine's
 * pure, port-shaped functions. Engine logic stays catalog-agnostic (it declares
 * `Pick<GameData, ...>` slices); this seam wires the real adapter once, so app
 * code imports pre-bound functions and never the catalog.
 *
 * It is one of two files (with `catalog/index.ts`) allowed to name a `catalog`
 * import directly. PR2 (UNN-500) binds the base-layer `resolve`; each domain PR
 * binds its functions here.
 */
export function createGameEngine(deps: GameData = gameData) {
  return {
    // The pure base fold (golden-master + pure-fold tests bind this directly).
    resolve: createResolve(deps),
    // The app-facing resolve: applies the active mechanic's form + effects (incl. the
    // PR5 equipment contribution) on top of the base fold (PR4 — UNN-502).
    resolveEntity: createResolveEntity(deps),
    // Items (PR5 — UNN-503): the mutation engine + inventory resolution + basic-attack
    // resolver, bound to the catalog so app surfaces call them without the lookups.
    applyInventoryMutation: (
      items: readonly InventoryItemState[],
      mutation: InventoryMutation,
      newId: () => string
    ) => applyInventoryMutation(items, mutation, deps, newId),
    resolveInventory: (items: readonly InventoryItemState[]) =>
      resolveInventory(deps, items),
    resolveBasicAttack: (
      entity: Entity,
      formNaturalAttack: IntrinsicAttack | null
    ) => resolveBasicAttack(deps, entity, formNaturalAttack),
  }
}

export type GameEngine = ReturnType<typeof createGameEngine>
