import { produce, type Draft } from "immer"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { MAX_FORTE } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

import { engagedWith, setEngaged, unlink } from "./engagement-graph"
import type { MapConnection, MapZone } from "./geometry.schema"
import type { MapInstanceEvent } from "./map-instance-event"
import type { MapInstanceState } from "./map-instance.schema"
import { reduceMapGeometry } from "./reduce-map-geometry"

/**
 * Per-slice event views over the single {@link MapInstanceEvent} union. PR1 ships only
 * the union (no named sub-types), so the slices narrow with inline `Extract` — the same
 * pattern {@link import("./reduce-map-geometry").reduceMapGeometry} uses, keeping the
 * event vocabulary untouched.
 */
type ZoneGraphEvent = Extract<
  MapInstanceEvent,
  { kind: "addZone" | "removeZone" | "setZoneAdjacency" | "renameZone" }
>
type MoveEvent = Extract<MapInstanceEvent, { kind: "moveCombatant" }>
type PlaceEvent = Extract<MapInstanceEvent, { kind: "placeCombatant" }>
type EngagementEvent = Extract<
  MapInstanceEvent,
  { kind: "setEngagement" | "clearEngagement" }
>
type EnchantmentEvent = Extract<
  MapInstanceEvent,
  { kind: "applyEnchantment" | "clearEnchantment" }
>
type RevealEvent = Extract<
  MapInstanceEvent,
  {
    kind:
      | "revealZone"
      | "hideZone"
      | "revealConnection"
      | "hideConnection"
      | "unlockConnection"
      | "lockConnection"
  }
>
type EditGeometryEvent = Extract<MapInstanceEvent, { kind: "editGeometry" }>

/**
 * The pure Map-Instance reducer (S4; ports v1 `engine/encounter/reduce-map-instance.ts`,
 * D2): applies a {@link MapInstanceEvent} to an immutable {@link MapInstanceState},
 * returning the next state. The spatial counterpart of the combat session reducer —
 * same conventions: a **decider** (deterministic, no I/O), **Immer**-drafted, **curried
 * deps-first** (`reduceMapInstance(newId)(state, event)`), and a **grouped exhaustive
 * `switch` with no `default`** so a new {@link MapInstanceEvent} kind fails to compile
 * here until handled. `newId` mints a Zone id for an `addZone` that omits one and the id
 * for a new `setZoneAdjacency` connection; no `GameData` lookup is needed — spatial
 * transitions consult no catalog.
 *
 * It owns every spatial transition: the zone graph (`zones` + id-keyed `connections`),
 * token occupancy (with the `move → break-engagement` **and** `move → reveal` rules),
 * engagement (symmetric, via the engagement-graph write primitives), the Zone
 * Enchantment, the runtime fog overlay (reveal/hide/unlock over the snapshotted
 * `hidden`/`locked` flags), and in-console geometry editing (delegating to
 * `reduceMapGeometry`).
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

      case "placeCombatant":
        return reducePlaceEvent(state, event)

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

      case "editGeometry":
        return reduceGeometryEditEvent(state, event)
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
 * `geometry.connections`). `addZone` records a full {@link MapZone} (defaulting
 * `position`/`description` for the ad-hoc combat-setup surface that authors only
 * name/notes) and `setZoneAdjacency` mints an id-keyed {@link MapConnection} with
 * default flags. `removeZone` also prunes every connection touching the zone and clears
 * the Enchantment when it sat on the removed Zone (both are Instance state, so keeping
 * them consistent is this reducer's own job) and leaves occupancy untouched — placement
 * cleanup is a separate concern. Each event no-ops on an unknown Zone id (Immer returns
 * the input untouched when no draft mutates).
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
 * Placement slice. Sets the token's `zoneId` verbatim (guides, doesn't block a
 * non-adjacent target). No-op on an unknown combatant (no token) or a move to the
 * occupied Zone. Two consequences of leaving the old Zone / entering the new one:
 *
 * - **`move → break-engagement` (D28#1 — deliberate SUPERSEDE; ⚠ DO NOT "fix" to
 *   parity):** engagement is a same-Zone lock, so leaving a Zone severs every
 *   engagement with a combatant *not* co-located in the destination, symmetrically on
 *   both tokens. v2 **couples move and lock** (ADR §2.5; SD7 / D28#1). This is the one
 *   intentional non-parity point in the spatial port: the SUPERSEDE is relative to the
 *   **UNN-315 requirements baseline**, which had *decoupled* move from lock (a move left
 *   the melee lock intact). The v1 reducer source (UNN-454) already moved past that
 *   baseline to this coupled behavior, so this port reproduces the v1 *code* exactly —
 *   but a reviewer checking against the requirements inventory must NOT revert it to
 *   keep-the-lock.
 * - **`move → reveal`**: entering a Zone reveals it to players (idempotent; only a real
 *   Zone, so a guides-not-blocks move to a phantom id adds no phantom reveal). Non-hidden
 *   neighbors surface as *known exits* by derivation, never written here.
 */
function reduceMoveEvent(
  state: MapInstanceState,
  event: MoveEvent
): MapInstanceState {
  return produce(state, (draft) => {
    const token = draft.occupancy[event.tokenKey]
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

    const self = asParticipantId(event.tokenKey)
    for (const targetId of engagedWith(token)) {
      if (draft.occupancy[targetId]?.zoneId === event.toZoneId) continue
      unlink(token, targetId)
      const target = draft.occupancy[targetId]
      if (target !== undefined) unlink(target, self)
    }
  })
}

/**
 * Placement slice for the **upserting** place gesture (UNN-535) — the setup
 * console's add-then-place flow, where a participant added without a zone holds
 * **no** token yet ({@link import("../encounter/reduce-encounter").comintMapInstance}'s
 * honest-unplaced shape). Placing an un-tokened combatant mints its token in the
 * target Zone with **free** engagement (the same genesis `addOccupant` writes)
 * and — unlike a move — **reveals nothing**: placement is a DM authoring
 * gesture, not observed movement, and a delve's DM staging enemies in an
 * unrevealed Zone must not surface it to players. Placing an already-tokened
 * combatant is exactly a {@link reduceMoveEvent} move — one home for the move
 * consequences (`move → break-engagement`, `move → reveal`).
 * {@link reduceMoveEvent} stays move-only (a mistyped `tokenKey` on the combat
 * board must not silently mint a stray token).
 */
function reducePlaceEvent(
  state: MapInstanceState,
  event: PlaceEvent
): MapInstanceState {
  if (state.occupancy[event.tokenKey] !== undefined) {
    return reduceMoveEvent(state, {
      kind: "moveCombatant",
      tokenKey: event.tokenKey,
      toZoneId: event.zoneId,
    })
  }
  return produce(state, (draft) => {
    draft.occupancy[event.tokenKey] = {
      zoneId: event.zoneId,
      engagement: { status: "free" },
    }
  })
}

/**
 * Engagement slice. Engagement is symmetric (A engaged with B ⟺ B engaged with A), so
 * every edit is mirrored onto the affected partner tokens via the engagement-graph write
 * primitives. `setEngagement` diffs added vs dropped targets; `clearEngagement` frees the
 * token and removes it from each partner. No-op on an unknown combatant or clearing an
 * already-Free token. Target ids are unvalidated (the engine guides; the DM control offers
 * same-Zone candidates). The opaque `tokenKey` is branded to its `ParticipantId` once —
 * engagement targets are participant ids (combat-only).
 */
function reduceEngagementEvent(
  state: MapInstanceState,
  event: EngagementEvent
): MapInstanceState {
  return produce(state, (draft) => {
    const token = draft.occupancy[event.tokenKey]
    if (token === undefined) return
    const self = asParticipantId(event.tokenKey)

    if (event.kind === "clearEngagement") {
      if (token.engagement.status === "free") return
      setEngaged(token, [])
      for (const other of Object.values(draft.occupancy)) {
        // Stryker disable next-line ConditionalExpression: equivalent — the token was just freed, so for every `other` (itself included) filtering an unchanged target list and re-stamping via setEngaged is idempotent; processing a non-partner anyway leaves the same state.
        if (engagedWith(other).includes(self)) {
          setEngaged(
            other,
            engagedWith(other).filter((id) => id !== self)
          )
        }
      }
      return
    }

    const next = new Set<string>(event.targetCombatantIds)
    const prev = new Set<string>(engagedWith(token))
    setEngaged(token, event.targetCombatantIds)

    for (const [otherId, other] of Object.entries(draft.occupancy)) {
      // Stryker disable next-line ConditionalExpression: equivalent — for a legal event a token never targets itself, so when `otherId` is the combatant `isTarget === prev.has(self)` (both false) and the next guard `continue`s anyway; the self-skip is redundant.
      if (otherId === event.tokenKey) continue
      const isTarget = next.has(otherId)
      // Stryker disable next-line ConditionalExpression: equivalent — for an `other` whose membership is unchanged, the branch below re-stamps the same target list, so not skipping is idempotent.
      if (isTarget === prev.has(otherId)) continue
      setEngaged(
        other,
        isTarget
          ? [...new Set([...engagedWith(other), self])]
          : engagedWith(other).filter((id) => id !== self)
      )
    }
  })
}

/**
 * Zone-Enchantment slice. Mutates the Instance's singleton `enchantment`: re-applying
 * the same type to the already-Enchanted Zone raises its Forte (capped at
 * {@link MAX_FORTE}); any other Zone or type replaces it at Forte 1. No-op on an unknown
 * Zone, or clearing when none is active.
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
 * Reveal slice — mutates the runtime fog overlay (`reveal`) over the immutable authored
 * `hidden`/`locked` flags. Reveal/unlock (the *add* ops) no-op on an unknown
 * Zone/connection id so a phantom can't enter the set; hide/lock (the *remove* ops) drop
 * the id, idempotent whether present or not. The `move → reveal` rule lives in
 * {@link reduceMoveEvent}; these are the DM's manual corrections.
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

/**
 * In-console geometry-edit slice — the convergence with the Map-template authoring core.
 * It delegates the inner {@link import("./geometry-event").MapGeometryEvent} to
 * {@link reduceMapGeometry} over `state.geometry` (so add/move/rename/retext zones,
 * draw/flag/delete connections, and the dedup/self-loop/cascade guards all behave
 * identically to the template), then layers the **Instance-only** cleanup a bare-geometry
 * reducer can't know about:
 *
 * - **Occupied-Zone delete is blocked** — deleting a Zone an occupancy token stands in is
 *   a no-op (returns the same `state`); the DM relocates the party first.
 * - **Fog + Enchantment reconciliation** — after a delete, prune the removed
 *   Zone/connections from the `reveal` overlay (no phantom revealed/unlocked ids) and
 *   clear the `enchantment` if its Zone no longer exists (generalizing the `removeZone`
 *   prune).
 *
 * A no-op inner edit (unknown id, empty rename, duplicate/self-loop connection) leaves
 * `reduceMapGeometry` returning the same geometry reference, so this returns the same
 * `state` reference — preserving the reducer's no-op contract.
 */
function reduceGeometryEditEvent(
  state: MapInstanceState,
  event: EditGeometryEvent
): MapInstanceState {
  if (event.event.kind === "deleteZone") {
    const { zoneId } = event.event
    const occupied = Object.values(state.occupancy).some(
      (token) => token.zoneId === zoneId
    )
    if (occupied) return state
  }

  const nextGeometry = reduceMapGeometry(state.geometry, event.event)
  if (nextGeometry === state.geometry) return state

  const removesGeometry =
    event.event.kind === "deleteZone" || event.event.kind === "deleteConnection"

  return produce(state, (draft) => {
    draft.geometry = nextGeometry
    if (!removesGeometry) return

    draft.reveal.revealedZoneIds = draft.reveal.revealedZoneIds.filter(
      (id) => nextGeometry.zones[id] !== undefined
    )
    draft.reveal.revealedConnectionIds =
      draft.reveal.revealedConnectionIds.filter(
        (id) => nextGeometry.connections[id] !== undefined
      )
    draft.reveal.unlockedConnectionIds =
      draft.reveal.unlockedConnectionIds.filter(
        (id) => nextGeometry.connections[id] !== undefined
      )
    if (
      draft.enchantment !== null &&
      nextGeometry.zones[draft.enchantment.zoneId] === undefined
    ) {
      draft.enchantment = null
    }
  })
}
