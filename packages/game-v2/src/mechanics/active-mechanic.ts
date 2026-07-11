import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  MECHANIC_KINDS,
  type MechanicKind,
} from "@workspace/game-v2/kernel/vocab/mechanics"
import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"
import type { MechanicState } from "@workspace/game-v2/mechanics/mechanics.schema"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"

/** An active mechanic resolved against an entity: its kind, state, and behavior. */
export interface ActiveMechanic {
  kind: MechanicKind
  state: MechanicState
  definition: MechanicDefinition<MechanicState>
}

/**
 * The active mechanics in a **canonical** order — their declared rank in
 * {@link MECHANIC_KINDS}, not the enumeration order of the `Mechanics` component's
 * `states` map. This makes the form fold (`active.reduce(applyActiveForm, …)` in
 * `resolveEntity`) and the mechanic-effects region of the pool a pure function of
 * the active *set*, never `Object.keys` order (UNN-599). A stable sort by rank.
 */
function orderActiveMechanics(active: ActiveMechanic[]): ActiveMechanic[] {
  return [...active].sort(
    (a, b) => MECHANIC_KINDS.indexOf(a.kind) - MECHANIC_KINDS.indexOf(b.kind)
  )
}

/**
 * The **≤ 1 active form-swap mechanic** invariant, enforced instead of assumed
 * (UNN-599). Form application is a last-write-wins merge of a full component bag
 * ({@link import("../resolve/resolve").applyForm}); two simultaneous form swaps
 * have no meaningful combined semantics, so this is a hard error rather than an
 * order-dependent result. Vacuously satisfied today — no registered mechanic
 * declares `activeForm` — and true by construction for a PC (≤ 1 active mechanic);
 * it bites only a future multi-form enemy, which is a authoring bug.
 */
export function assertAtMostOneActiveForm(active: ActiveMechanic[]): void {
  const forms = active.filter((mechanic) => mechanic.definition.activeForm)
  if (forms.length > 1) {
    throw new Error(
      `An entity has ${forms.length} active form-swap mechanics (${forms
        .map((mechanic) => mechanic.kind)
        .join(", ")}); at most one may be active at a time.`
    )
  }
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
 * mechanic is active?" lives in one place. Returns 0..n **in canonical
 * {@link MECHANIC_KINDS} order** (not the `states` map's enumeration order), so the
 * form fold and the pool's mechanic region are a pure function of the active *set*.
 * Enforces the **≤ 1 active form-swap mechanic** invariant
 * ({@link assertAtMostOneActiveForm}). A PC has at most one active mechanic, an
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
  const active = orderActiveMechanics(collectActiveMechanics(deps, entity))
  assertAtMostOneActiveForm(active)
  return active
}

/** The raw active set (unordered) — the capability walk, before the canonical
 * ordering and the ≤ 1-form invariant {@link getActiveMechanics} applies. */
function collectActiveMechanics(
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
