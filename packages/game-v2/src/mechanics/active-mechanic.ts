import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"
import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"
import type { MechanicState } from "@workspace/game-v2/mechanics/mechanics.schema"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"

/** An active mechanic resolved against an entity: its kind, state, and behavior. */
export interface ActiveMechanic {
  kind: MechanicKind
  state: MechanicState
  definition: MechanicDefinition<MechanicState>
}

function resolveActive(
  kind: MechanicKind,
  mechanics: Entity["components"]["mechanics"],
  fallbackToInitial: boolean
): ActiveMechanic | null {
  const definition = getMechanic(kind)
  if (!definition) return null
  const stored = mechanics?.states[kind]
  const state =
    stored ?? (fallbackToInitial ? definition.initialState() : undefined)
  if (state === undefined) return null
  return { kind, state, definition }
}

/**
 * The entity's currently-active mechanic(s), the single shared walk both the
 * effects fold and the form-swap step
 * ({@link import("./resolve-entity").createResolveEntity}) consult — so "which
 * mechanic is active?" lives in one place. Returns 0..n: a PC has at most one, an
 * enemy may carry several.
 *
 * The gate is **capability presence, not entity kind** (the ECS thesis, D36):
 *
 * - **Has an `Archetypes` component (a PC):** only the mechanic belonging to the
 *   **active Archetype** is on (`archetypes.active → getArchetype(active).mechanic`),
 *   so switching Archetypes never applies an inactive one. An absent-but-owned state
 *   is coerced to the mechanic's `initialState()` (an active Perfection with no stored
 *   rank is rank D, contributing nothing).
 * - **No `Archetypes` component (an enemy / statless NPC):** **every** mechanic it
 *   carries in its `Mechanics` component is always on — no archetype gating (a
 *   Nyx-style enemy's Arcana-swap, a summon's mechanic). Only persisted states count
 *   (no initial-state coercion — an enemy authors the mechanics it has).
 */
export function getActiveMechanics(
  deps: Pick<GameData, "getArchetype">,
  entity: Entity
): ActiveMechanic[] {
  const { archetypes, mechanics } = entity.components

  if (archetypes) {
    const kind = archetypes.active
      ? deps.getArchetype(archetypes.active)?.mechanic
      : undefined
    if (!kind) return []
    const active = resolveActive(kind, mechanics, true)
    return active ? [active] : []
  }

  if (!mechanics) return []
  return (Object.keys(mechanics.states) as MechanicKind[])
    .map((kind) => resolveActive(kind, mechanics, false))
    .filter((active): active is ActiveMechanic => active !== null)
}
