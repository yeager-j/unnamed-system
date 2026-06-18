import { produce, type Draft } from "immer"

import {
  engagedWith,
  setEngaged,
  unlink,
} from "@workspace/game/engine/encounter/engagement-graph"
import { MAX_FORTE } from "@workspace/game/foundation/combat/enchantment"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type {
  EnchantmentEvent,
  EngagementEvent,
  MapInstanceEvent,
  MoveCombatantEvent,
  RevealEvent,
  ZoneGraphEvent,
} from "@workspace/game/foundation/encounter/map-instance-event"
import type {
  MapConnection,
  MapZone,
} from "@workspace/game/foundation/map/geometry"

/**
 * The pure Map-Instance reducer (UNN-454): applies a {@link MapInstanceEvent} to
 * an immutable {@link MapInstanceState}, returning the next state. The spatial
 * counterpart of {@link reduceCombatSession} — same conventions: a **decider**
 * (deterministic, no I/O), **Immer**-drafted, **curried deps-first**
 * (`reduceMapInstance(newId)(state, event)`), and a **grouped exhaustive `switch`
 * with no `default`** so a new {@link MapInstanceEvent} kind fails to compile here
 * until it is handled. `newId` mints a Zone id for an `addZone` that omits one and
 * the id for a new `setZoneAdjacency` connection; no `GameData` lookup is needed —
 * spatial transitions consult no catalog.
 *
 * It owns every spatial transition once the spatial state lives on the Instance:
 * the zone graph (geometry — `zones` + id-keyed `connections`, M2/UNN-464), token
 * occupancy (with the `move → break-engagement` **and** `move → reveal` rules),
 * engagement, the Zone Enchantment, and the runtime fog overlay (reveal/hide/
 * unlock over the snapshotted `hidden`/`locked` flags).
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

      case "revealZone":
      case "hideZone":
      case "revealConnection":
      case "hideConnection":
      case "unlockConnection":
      case "lockConnection":
        return reduceRevealEvent(state, event)
    }
  }
}

/** The connection id joining the unordered pair `(a, b)`, or `undefined`. */
function connectionIdBetween(
  connections: Draft<MapInstanceState>["geometry"]["connections"],
  a: string,
  b: string
): string | undefined {
  for (const [id, conn] of Object.entries(connections)) {
    if (
      (conn.fromZoneId === a && conn.toZoneId === b) ||
      (conn.fromZoneId === b && conn.toZoneId === a)
    ) {
      return id
    }
  }
  return undefined
}

/**
 * Zone-graph slice — mutates the Instance geometry (`geometry.zones` +
 * `geometry.connections`). M2 (UNN-464) converged the geometry onto the rich
 * template shape, so `addZone` records a full {@link MapZone} (defaulting
 * `position`/`description` for the ad-hoc combat-setup surface that authors only
 * name/notes) and `setZoneAdjacency` mints an id-keyed {@link MapConnection} with
 * default flags. `removeZone` also prunes every connection touching the zone and
 * clears the Enchantment when it sat on the removed Zone (both are Instance state,
 * so keeping them consistent is this reducer's own job) and leaves occupancy
 * untouched — placement cleanup is a separate concern. Each event no-ops on an
 * unknown Zone id (Immer returns the input untouched when no draft mutates).
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
        const zone: MapZone = {
          id,
          name: event.name,
          description: "",
          dmNotes: event.notes ?? "",
          position: { x: 0, y: 0 },
        }
        draft.geometry.zones[id] = zone
        return
      }

      case "removeZone": {
        // Stryker disable next-line ConditionalExpression: equivalent — removing an unknown Zone mutates nothing downstream (the deletes/connection-prune/enchantment-check all no-op), so Immer returns the same ref with or without this short-circuit.
        if (draft.geometry.zones[event.zoneId] === undefined) return
        delete draft.geometry.zones[event.zoneId]
        for (const [connId, conn] of Object.entries(
          draft.geometry.connections
        )) {
          if (
            conn.fromZoneId === event.zoneId ||
            conn.toZoneId === event.zoneId
          ) {
            delete draft.geometry.connections[connId]
          }
        }
        if (draft.enchantment?.zoneId === event.zoneId) {
          draft.enchantment = null
        }
        return
      }

      case "setZoneAdjacency": {
        if (event.zoneIdA === event.zoneIdB) return
        const bothExist =
          draft.geometry.zones[event.zoneIdA] !== undefined &&
          draft.geometry.zones[event.zoneIdB] !== undefined
        if (!bothExist) return
        const existing = connectionIdBetween(
          draft.geometry.connections,
          event.zoneIdA,
          event.zoneIdB
        )
        if (event.adjacent) {
          if (existing !== undefined) return
          const id = newId()
          const connection: MapConnection = {
            id,
            fromZoneId: event.zoneIdA,
            toZoneId: event.zoneIdB,
            hidden: false,
            locked: false,
          }
          draft.geometry.connections[id] = connection
        } else if (existing !== undefined) {
          delete draft.geometry.connections[existing]
        }
        return
      }

      case "renameZone": {
        const zone = draft.geometry.zones[event.zoneId]
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
 * combatant (no token) or a move to the occupied Zone. Two consequences of leaving
 * the old Zone / entering the new one:
 *
 * - **`move → break-engagement`**: engagement is a same-Zone lock, so leaving a
 *   Zone severs every engagement with a combatant *not* co-located in the
 *   destination, symmetrically on both tokens.
 * - **`move → reveal`** (UNN-464): entering a Zone reveals it to players
 *   (idempotent; only a real Zone, so a guides-not-blocks move to a phantom id
 *   adds no phantom reveal). Non-hidden neighbors surface as *known exits* by
 *   derivation, never written here — see {@link import("./resolve-reveal").resolveRevealView}.
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

    if (
      draft.geometry.zones[event.toZoneId] !== undefined &&
      !draft.reveal.revealedZoneIds.includes(event.toZoneId)
    ) {
      draft.reveal.revealedZoneIds.push(event.toZoneId)
    }

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
        if (draft.geometry.zones[event.zoneId] === undefined) return

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

/** Adds `id` to the set-as-array if absent; idempotent. */
function addToSet(set: string[], id: string): void {
  if (!set.includes(id)) set.push(id)
}

/** Drops `id` from the set-as-array (a no-op when absent). */
function removeFromSet(set: string[], id: string): void {
  const index = set.indexOf(id)
  if (index !== -1) set.splice(index, 1)
}

/**
 * Reveal slice (UNN-464) — mutates the runtime fog overlay (`reveal`) over the
 * immutable authored `hidden`/`locked` flags. Reveal/unlock (the *add* ops) no-op
 * on an unknown Zone/connection id so a phantom can't enter the set; hide/lock
 * (the *remove* ops) drop the id, idempotent whether present or not. The
 * `move → reveal` rule lives in {@link reduceMoveEvent}; these are the DM's manual
 * corrections.
 */
function reduceRevealEvent(
  state: MapInstanceState,
  event: RevealEvent
): MapInstanceState {
  return produce(state, (draft) => {
    switch (event.kind) {
      case "revealZone":
        if (draft.geometry.zones[event.zoneId] === undefined) return
        addToSet(draft.reveal.revealedZoneIds, event.zoneId)
        return

      case "hideZone":
        removeFromSet(draft.reveal.revealedZoneIds, event.zoneId)
        return

      case "revealConnection":
        if (draft.geometry.connections[event.connectionId] === undefined) return
        addToSet(draft.reveal.revealedConnectionIds, event.connectionId)
        return

      case "hideConnection":
        removeFromSet(draft.reveal.revealedConnectionIds, event.connectionId)
        return

      case "unlockConnection":
        if (draft.geometry.connections[event.connectionId] === undefined) return
        addToSet(draft.reveal.unlockedConnectionIds, event.connectionId)
        return

      case "lockConnection":
        removeFromSet(draft.reveal.unlockedConnectionIds, event.connectionId)
        return
    }
  })
}
