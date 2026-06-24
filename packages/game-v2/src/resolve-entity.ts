import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  getActiveMechanics,
  type ActiveMechanic,
} from "@workspace/game-v2/mechanics/active-mechanic"
import {
  applyForm,
  createResolve,
  type ResolveContext,
} from "@workspace/game-v2/progression/resolve"

/**
 * The pre-resolve form transform (D38, layer 2): merge the active form-swap
 * mechanic's form bag onto the entity via `applyForm`, or return the entity
 * unchanged (same ref) when no form is active. Pure and decoupled from the
 * registry — it takes an already-resolved {@link ActiveMechanic} — so the
 * form-swap seam is testable with a fixture form-swap mechanic before any real one
 * is registered.
 */
export function applyActiveForm(
  active: ActiveMechanic | null,
  entity: Entity
): Entity {
  const form = active?.definition.activeForm?.(active.state) ?? null
  return form ? applyForm(entity, form) : entity
}

/**
 * The **mechanic-aware resolve** — the app-facing entry point that layers an
 * entity's active mechanic(s) onto the pure {@link createResolve} fold (D8 layers 2
 * + 5). It reads the active mechanic(s) **once** ({@link getActiveMechanics}) — a PC
 * has at most one, an enemy may carry several — and derives both contributions:
 *
 * - **Active form** (D38, layer 2): each form-swap mechanic's form bag is merged via
 *   `applyForm` **before** `resolve` — a pre-resolve `Entity → Entity` transform, so
 *   `resolve` itself keeps no form branch. No MVP mechanic declares a form yet.
 * - **Effects** (layer 5): the mechanics' `effects()` are prepended to the caller's
 *   context effects (a Zone Enchantment, etc.) and handed to `resolve`, which folds
 *   attribute/affinity in and surfaces attack-roll/damage as `pendingEffects`.
 *
 * The mechanics are read from the **original** entity (a PC's active Archetype is
 * still attached); `applyForm` then detaches it. Keeping this orchestration in
 * `mechanics/` (over the pure progression fold) keeps the dependency one-way —
 * `mechanics → progression`, never the reverse.
 */
export function createResolveEntity(deps: Pick<GameData, "getArchetype">) {
  const resolve = createResolve(deps)

  return function resolveEntity(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    const active = getActiveMechanics(deps, entity)

    const formed = active.reduce(
      (current, mechanic) => applyActiveForm(mechanic, current),
      entity
    )

    const mechanicEffects = active.flatMap(
      (mechanic) => mechanic.definition.effects?.(mechanic.state) ?? []
    )
    const effects = [...mechanicEffects, ...(context.effects ?? [])]

    return resolve(formed, { effects })
  }
}
