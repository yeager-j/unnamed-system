import { produce, type Draft } from "immer"

import {
  engagedWith,
  setEngaged,
  unlink,
} from "@workspace/game/engine/encounter/engagement-graph"
import { MAX_FORTE } from "@workspace/game/foundation/combat/enchantment"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type { MapInstanceEvent } from "@workspace/game/foundation/encounter/map-instance-event"
import type { Zone } from "@workspace/game/foundation/encounter/session"
import type {
  EnchantmentEvent,
  EngagementEvent,
  MoveCombatantEvent,
  ZoneGraphEvent,
} from "@workspace/game/foundation/encounter/session-event"

/**
 * The pure Map-Instance reducer (UNN-454): applies a {@link MapInstanceEvent} to
 * an immutable {@link MapInstanceState}, returning the next state. The spatial
 * counterpart of {@link reduceCombatSession} — same conventions: a **decider**
 * (deterministic, no I/O), **Immer**-drafted, **curried deps-first**
 * (`reduceMapInstance(newId)(state, event)`), and a **grouped exhaustive `switch`
 * with no `default`** so a new {@link MapInstanceEvent} kind fails to compile here
 * ("not all code paths return a value") until it is handled. `newId` mints a Zone
 * id for an `addZone` that omits one (the same injectable as the session reducer);
 * no `GameData` lookup is needed — spatial transitions consult no catalog.
 *
 * It owns every spatial transition once the spatial state lives on the Instance:
 * the zone graph, token occupancy (with the move→break-engagement rule),
 * engagement, and the Zone Enchantment. The behavior is the shipped session-slice
 * logic relocated onto the Instance shape — engagement rides each occupancy token
 * (`occupancy[combatantId].engagement`, kept symmetric by mirror-writes) and
 * enchantment is the global singleton. **Additive** (UNN-454): this is built and
 * tested but not yet wired as the spatial owner — the M0 cutover (UNN-459) does
 * that. `reveal`/`hide`/`unlock` + `move→reveal` arrive with reveal-state in
 * M1/M2 (UNN-461 / UNN-464).
 */
export function reduceMapInstance(newId: () => string) {
  return (
    state: MapInstanceState,
    event: MapInstanceEvent
  ): MapInstanceState => {
    switch (event.kind) {
      case "addZone":
      case "removeZone":
      case "setZoneAdjacency":
      case "renameZone":
        return reduceZoneGraphEvent(state, event, newId)

      case "moveCombatant":
        return reduceMoveEvent(state, event)

      case "setEngagement":
      case "clearEngagement":
        return reduceEngagementEvent(state, event)

      case "applyEnchantment":
      case "clearEnchantment":
        return reduceEnchantmentEvent(state, event)
    }
  }
}

/** Records `to` in `from`'s adjacency list, creating it if absent; idempotent. */
function addEdge(
  draft: Draft<MapInstanceState>,
  from: string,
  to: string
): void {
  const neighbors = (draft.adjacency[from] ??= [])
  if (!neighbors.includes(to)) neighbors.push(to)
}

/** Drops `to` from `from`'s adjacency list (a no-op when absent). */
function removeEdge(
  draft: Draft<MapInstanceState>,
  from: string,
  to: string
): void {
  const neighbors = draft.adjacency[from]
  if (neighbors === undefined) return
  const index = neighbors.indexOf(to)
  if (index !== -1) neighbors.splice(index, 1)
}

/**
 * Zone-graph slice, relocated from `reduce/zones.ts`. `removeZone` also clears the
 * Enchantment when it sat on the removed Zone (both are Instance state, so keeping
 * them consistent is this reducer's own job) and leaves occupancy untouched —
 * placement cleanup is a separate concern, the shipped parity. Each event no-ops
 * on an unknown Zone id (Immer returns the input untouched when no draft mutates).
 */
function reduceZoneGraphEvent(
  state: MapInstanceState,
  event: ZoneGraphEvent,
  newId: () => string
): MapInstanceState {
  return produce(state, (draft) => {
    switch (event.kind) {
      case "addZone": {
        const id = event.zoneId ?? newId()
        const zone: Zone = { id, name: event.name }
        if (event.notes !== undefined) zone.notes = event.notes
        draft.zones[id] = zone
        return
      }

      case "removeZone": {
        // Stryker disable next-line ConditionalExpression: equivalent — removing an unknown Zone mutates nothing downstream (the deletes/edge-prune/enchantment-check all no-op), so Immer returns the same ref with or without this short-circuit.
        if (draft.zones[event.zoneId] === undefined) return
        delete draft.zones[event.zoneId]
        delete draft.adjacency[event.zoneId]
        for (const zoneId of Object.keys(draft.adjacency)) {
          removeEdge(draft, zoneId, event.zoneId)
        }
        if (draft.enchantment?.zoneId === event.zoneId) {
          draft.enchantment = null
        }
        return
      }

      case "setZoneAdjacency": {
        if (event.zoneIdA === event.zoneIdB) return
        const bothExist =
          draft.zones[event.zoneIdA] !== undefined &&
          draft.zones[event.zoneIdB] !== undefined
        if (!bothExist) return
        if (event.adjacent) {
          addEdge(draft, event.zoneIdA, event.zoneIdB)
          addEdge(draft, event.zoneIdB, event.zoneIdA)
        } else {
          removeEdge(draft, event.zoneIdA, event.zoneIdB)
          removeEdge(draft, event.zoneIdB, event.zoneIdA)
        }
        return
      }

      case "renameZone": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        zone.name = event.name
        return
      }
    }
  })
}

/**
 * Placement slice, relocated from `reduce/placement.ts`. Sets the token's `zoneId`
 * verbatim (guides, doesn't block a non-adjacent target). No-op on an unknown
 * combatant (no token) or a move to the occupied Zone. Engagement is a same-Zone
 * lock, so leaving a Zone severs every engagement with a combatant *not* co-located
 * in the destination, symmetrically on both tokens.
 */
function reduceMoveEvent(
  state: MapInstanceState,
  event: MoveCombatantEvent
): MapInstanceState {
  return produce(state, (draft) => {
    const token = draft.occupancy[event.combatantId]
    if (token === undefined) return
    // Stryker disable next-line ConditionalExpression: equivalent — moving to the occupied Zone writes the same `zoneId` (an Immer no-op ⇒ same ref) and severs nothing (legal engagements are same-Zone), so the short-circuit is unobservable.
    if (token.zoneId === event.toZoneId) return
    token.zoneId = event.toZoneId

    for (const targetId of engagedWith(token)) {
      if (draft.occupancy[targetId]?.zoneId === event.toZoneId) continue
      unlink(token, targetId)
      const target = draft.occupancy[targetId]
      if (target !== undefined) unlink(target, event.combatantId)
    }
  })
}

/**
 * Engagement slice, relocated from `reduce/engagement.ts`. Engagement is symmetric
 * (A engaged with B ⟺ B engaged with A), so every edit is mirrored onto the
 * affected partner tokens. `setEngagement` diffs added vs dropped targets;
 * `clearEngagement` frees the token and removes it from each partner. No-op on an
 * unknown combatant or clearing an already-Free token. Target ids are unvalidated
 * (the engine guides, the DM control offers same-Zone candidates).
 */
function reduceEngagementEvent(
  state: MapInstanceState,
  event: EngagementEvent
): MapInstanceState {
  return produce(state, (draft) => {
    const token = draft.occupancy[event.combatantId]
    if (token === undefined) return

    if (event.kind === "clearEngagement") {
      if (token.engagement.status === "free") return
      setEngaged(token, [])
      for (const other of Object.values(draft.occupancy)) {
        // Stryker disable next-line ConditionalExpression: equivalent — the token was just freed, so for every `other` (itself included) filtering an unchanged target list and re-stamping via setEngaged is idempotent; processing a non-partner anyway leaves the same state.
        if (engagedWith(other).includes(event.combatantId)) {
          setEngaged(
            other,
            engagedWith(other).filter((id) => id !== event.combatantId)
          )
        }
      }
      return
    }

    const next = new Set(event.targetCombatantIds)
    const prev = new Set(engagedWith(token))
    setEngaged(token, event.targetCombatantIds)

    for (const [otherId, other] of Object.entries(draft.occupancy)) {
      // Stryker disable next-line ConditionalExpression: equivalent — for a legal event a token never targets itself, so when `otherId` is the combatant `isTarget === prev.has(self)` (both false) and the next guard `continue`s anyway; the self-skip is redundant.
      if (otherId === event.combatantId) continue
      const isTarget = next.has(otherId)
      // Stryker disable next-line ConditionalExpression: equivalent — for an `other` whose membership is unchanged, the branch below re-stamps the same target list, so not skipping is idempotent.
      if (isTarget === prev.has(otherId)) continue
      setEngaged(
        other,
        isTarget
          ? [...new Set([...engagedWith(other), event.combatantId])]
          : engagedWith(other).filter((id) => id !== event.combatantId)
      )
    }
  })
}

/**
 * Zone-Enchantment slice, relocated from `reduce/enchantment.ts`. Mutates the
 * Instance's singleton `enchantment`: re-applying the same type to the already-
 * Enchanted Zone raises its Forte (capped at {@link MAX_FORTE}); any other Zone or
 * type replaces it at Forte 1. No-op on an unknown Zone, or clearing when none is
 * active.
 */
function reduceEnchantmentEvent(
  state: MapInstanceState,
  event: EnchantmentEvent
): MapInstanceState {
  return produce(state, (draft) => {
    switch (event.kind) {
      case "applyEnchantment": {
        if (draft.zones[event.zoneId] === undefined) return

        const current = draft.enchantment
        const sameZoneAndType =
          current?.zoneId === event.zoneId && current.type === event.enchantment

        draft.enchantment = sameZoneAndType
          ? { ...current, forte: Math.min(current.forte + 1, MAX_FORTE) }
          : { zoneId: event.zoneId, type: event.enchantment, forte: 1 }
        return
      }

      case "clearEnchantment": {
        // Stryker disable next-line ConditionalExpression: equivalent — when no Enchantment is active, assigning `null` over `null` is an Immer no-op (same ref), so the short-circuit is unobservable.
        if (draft.enchantment === null) return
        draft.enchantment = null
        return
      }
    }
  })
}
