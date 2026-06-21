import { produce } from "immer"

import type { MapGeometry } from "@workspace/game/foundation/map/geometry"
import type {
  ConnectionFlag,
  MapGeometryEvent,
} from "@workspace/game/foundation/map/geometry-event"

export type { ConnectionFlag, MapGeometryEvent }

/**
 * The pure Map-**template** geometry reducer (UNN-485): applies one
 * {@link MapGeometryEvent} to an immutable {@link MapGeometry}, returning the next
 * geometry. The authoring counterpart to {@link import("../encounter/reduce-map-instance").reduceMapInstance}
 * — same conventions: a **decider** (deterministic, no I/O), **Immer**-drafted,
 * and a **grouped exhaustive `switch` with no `default`** so a new event kind
 * fails to compile until handled — but over bare {@link MapGeometry} rather than
 * the Map Instance. It is **not** curried: the template autosaves the whole
 * `geometry` blob (it is not event-sourced), and the canvas mints ids itself so it
 * knows the new id up front for the optimistic React-Flow node/edge it pushes — so
 * ids ride on the events, and there is no `newId`/`GameData` dependency to inject.
 * It is therefore used **directly** (not bound through `createGameEngine`),
 * mirroring `reduceDungeon`.
 *
 * Every edit keeps the blob **valid against `mapGeometrySchema`** so it always
 * round-trips through `saveMapAction`: names stay non-empty (empty renames no-op),
 * connections never duplicate or self-loop, and deleting a Zone cascades the
 * connections that reference it. An edit naming an unknown id is a no-op — and
 * because the recipe then mutates no draft, Immer returns the **same reference**,
 * which the canvas relies on (`next === geometryRef.current` skips redundant work).
 *
 * **Convergence with the Map Instance (UNN-486 / UNN-464):** this is the shared
 * pure geometry-mutation core. UNN-486 (in-console geometry editing on the live
 * Instance) will **delegate to it** — applying `reduceMapGeometry` to
 * `state.geometry` and layering the Instance-only cascades on top (e.g. pruning
 * the Zone Enchantment when its Zone is deleted). The pre-existing Instance
 * {@link import("@workspace/game/foundation/encounter/map-instance-event").ZoneGraphEvent}
 * **setup** protocol (Zod-schema'd + lockstep-guarded for the combat-setup
 * surface) is deliberately kept separate: reworking that wire protocol is a
 * distinct concern with its own trigger.
 */
export function reduceMapGeometry(
  geometry: MapGeometry,
  event: MapGeometryEvent
): MapGeometry {
  switch (event.kind) {
    case "addZone":
    case "duplicateZone":
    case "renameZone":
    case "setZoneText":
    case "moveZone":
    case "deleteZone":
      return reduceZoneEvent(geometry, event)

    case "addConnection":
    case "setConnectionFlag":
    case "deleteConnection":
      return reduceConnectionEvent(geometry, event)
  }
}

/**
 * Zone-slice edits — add/duplicate/rename/retext/move/delete a Zone. `deleteZone`
 * also cascades every connection that referenced the removed Zone (connections are
 * undirected, so either endpoint matches). Each event no-ops on an unknown Zone id
 * (Immer returns the input untouched when no draft mutates).
 */
function reduceZoneEvent(
  geometry: MapGeometry,
  event: Extract<
    MapGeometryEvent,
    {
      kind:
        | "addZone"
        | "duplicateZone"
        | "renameZone"
        | "setZoneText"
        | "moveZone"
        | "deleteZone"
    }
  >
): MapGeometry {
  return produce(geometry, (draft) => {
    switch (event.kind) {
      case "addZone": {
        draft.zones[event.id] = {
          id: event.id,
          name: nextZoneName(geometry.zones),
          description: "",
          dmNotes: "",
          position: event.position,
        }
        return
      }

      case "duplicateZone": {
        const source = geometry.zones[event.sourceId]
        if (source === undefined) return
        draft.zones[event.newId] = {
          ...source,
          id: event.newId,
          name: `${source.name} copy`,
          position: event.position,
        }
        return
      }

      case "renameZone": {
        const zone = draft.zones[event.zoneId]
        const trimmed = event.name.trim()
        if (zone === undefined || trimmed.length === 0) return
        zone.name = trimmed
        return
      }

      case "setZoneText": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        Object.assign(zone, event.patch)
        return
      }

      case "moveZone": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        zone.position = event.position
        return
      }

      case "deleteZone": {
        if (draft.zones[event.zoneId] === undefined) return
        delete draft.zones[event.zoneId]
        for (const [connId, conn] of Object.entries(draft.connections)) {
          if (
            conn.fromZoneId === event.zoneId ||
            conn.toZoneId === event.zoneId
          ) {
            delete draft.connections[connId]
          }
        }
        return
      }
    }
  })
}

/**
 * Connection-slice edits — add/flag/delete an undirected connection. `addConnection`
 * no-ops on a self-loop, an unknown endpoint, or a duplicate of an existing edge
 * (either direction); the flag/delete edits no-op on an unknown connection id.
 */
function reduceConnectionEvent(
  geometry: MapGeometry,
  event: Extract<
    MapGeometryEvent,
    { kind: "addConnection" | "setConnectionFlag" | "deleteConnection" }
  >
): MapGeometry {
  return produce(geometry, (draft) => {
    switch (event.kind) {
      case "addConnection": {
        if (
          event.fromZoneId === event.toZoneId ||
          draft.zones[event.fromZoneId] === undefined ||
          draft.zones[event.toZoneId] === undefined ||
          connectionExists(
            geometry.connections,
            event.fromZoneId,
            event.toZoneId
          )
        ) {
          return
        }
        draft.connections[event.id] = {
          id: event.id,
          fromZoneId: event.fromZoneId,
          toZoneId: event.toZoneId,
          hidden: false,
          locked: false,
        }
        return
      }

      case "setConnectionFlag": {
        const connection = draft.connections[event.connectionId]
        if (connection === undefined) return
        connection[event.flag] = event.value
        return
      }

      case "deleteConnection": {
        if (draft.connections[event.connectionId] === undefined) return
        delete draft.connections[event.connectionId]
        return
      }
    }
  })
}

/**
 * The default name for a freshly-added Zone — the lowest `Zone N` (N ≥ 1) not
 * already in use, so adding several in a row reads naturally and doesn't trip the
 * duplicate-name warning immediately.
 */
function nextZoneName(zones: MapGeometry["zones"]): string {
  const taken = new Set(Object.values(zones).map((zone) => zone.name))
  let n = 1
  while (taken.has(`Zone ${n}`)) n += 1
  return `Zone ${n}`
}

/** True when the two Zones are already joined (undirected) by some connection. */
function connectionExists(
  connections: MapGeometry["connections"],
  zoneIdA: string,
  zoneIdB: string
): boolean {
  return Object.values(connections).some(
    (connection) =>
      (connection.fromZoneId === zoneIdA && connection.toZoneId === zoneIdB) ||
      (connection.fromZoneId === zoneIdB && connection.toZoneId === zoneIdA)
  )
}
