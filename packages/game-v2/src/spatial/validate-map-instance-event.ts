import { err, ok, type Result } from "@workspace/result"

import type { MapGeometryEvent } from "./geometry-event"
import type { DirectMapInstanceEvent } from "./map-instance-event"
import type { MapInstanceState } from "./map-instance.schema"

export type DirectMapInstanceEventRefusal =
  | "zone-not-found"
  | "connection-not-found"
  | "page-not-found"
  | "token-not-found"
  | "identity-collision"
  | "zone-occupied"
  | "page-occupied"
  | "invalid-target"
  | "last-page"

/**
 * Checks the structural preconditions shared by every direct Map Instance
 * writer. Authorization and concurrency evidence belong to the caller; graph,
 * occupancy, and identity invariants belong with the spatial model.
 */
export function validateDirectMapInstanceEvent(
  state: MapInstanceState,
  event: DirectMapInstanceEvent
): Result<void, DirectMapInstanceEventRefusal> {
  const zones = state.geometry.zones
  const connections = state.geometry.connections
  switch (event.kind) {
    case "addZone":
      if (event.zoneId === undefined) return err("invalid-target")
      return zones[event.zoneId] === undefined
        ? ok(undefined)
        : err("identity-collision")
    case "removeZone":
      if (zones[event.zoneId] === undefined) return err("zone-not-found")
      if (Object.values(state.occupancy).some((t) => t.zoneId === event.zoneId))
        return err("zone-occupied")
      return ok(undefined)
    case "setZoneAdjacency": {
      if (
        zones[event.zoneIdA] === undefined ||
        zones[event.zoneIdB] === undefined
      )
        return err("zone-not-found")
      if (event.zoneIdA === event.zoneIdB) return err("invalid-target")
      if (event.adjacent && event.connectionId === undefined) {
        return err("invalid-target")
      }
      if (
        event.adjacent &&
        event.connectionId !== undefined &&
        connections[event.connectionId] !== undefined
      ) {
        return err("identity-collision")
      }
      return ok(undefined)
    }
    case "renameZone":
    case "applyEnchantment":
    case "revealZone":
    case "hideZone":
      return zones[event.zoneId] === undefined
        ? err("zone-not-found")
        : ok(undefined)
    case "moveCombatant":
      if (state.occupancy[event.tokenKey] === undefined)
        return err("token-not-found")
      return zones[event.toZoneId] === undefined
        ? err("zone-not-found")
        : ok(undefined)
    case "placeCombatant":
      return zones[event.zoneId] === undefined
        ? err("zone-not-found")
        : ok(undefined)
    case "setEngagement":
      if (state.occupancy[event.tokenKey] === undefined)
        return err("token-not-found")
      return event.targetCombatantIds.every(
        (id) => state.occupancy[id] !== undefined
      )
        ? ok(undefined)
        : err("token-not-found")
    case "clearEngagement":
      return state.occupancy[event.tokenKey] === undefined
        ? err("token-not-found")
        : ok(undefined)
    case "clearEnchantment":
      return ok(undefined)
    case "revealConnection":
    case "hideConnection":
    case "unlockConnection":
    case "lockConnection":
      return connections[event.connectionId] === undefined
        ? err("connection-not-found")
        : ok(undefined)
    case "editGeometry":
      return validateGeometryEvent(state, event.event)
  }
}

function validateGeometryEvent(
  state: MapInstanceState,
  event: MapGeometryEvent
): Result<void, DirectMapInstanceEventRefusal> {
  const { zones, connections, pages } = state.geometry
  switch (event.kind) {
    case "addZone":
      if (pages[event.pageId] === undefined) return err("page-not-found")
      return zones[event.id] === undefined
        ? ok(undefined)
        : err("identity-collision")
    case "duplicateZone":
      if (zones[event.sourceId] === undefined) return err("zone-not-found")
      if (pages[event.pageId] === undefined) return err("page-not-found")
      return zones[event.newId] === undefined
        ? ok(undefined)
        : err("identity-collision")
    case "renameZone":
    case "setZoneText":
    case "setZoneIdentity":
    case "setZoneBinding":
    case "moveZone":
      return zones[event.zoneId] === undefined
        ? err("zone-not-found")
        : ok(undefined)
    case "deleteZone":
      if (zones[event.zoneId] === undefined) return err("zone-not-found")
      return Object.values(state.occupancy).some(
        (token) => token.zoneId === event.zoneId
      )
        ? err("zone-occupied")
        : ok(undefined)
    case "setEntryZone":
      return event.zoneId !== null && zones[event.zoneId] === undefined
        ? err("zone-not-found")
        : ok(undefined)
    case "addConnection":
      if (
        zones[event.fromZoneId] === undefined ||
        zones[event.toZoneId] === undefined
      )
        return err("zone-not-found")
      if (connections[event.id] !== undefined) return err("identity-collision")
      return event.fromZoneId === event.toZoneId
        ? err("invalid-target")
        : ok(undefined)
    case "setConnectionFlag":
    case "deleteConnection":
      return connections[event.connectionId] === undefined
        ? err("connection-not-found")
        : ok(undefined)
    case "addPage":
      return pages[event.id] === undefined
        ? ok(undefined)
        : err("identity-collision")
    case "renamePage":
    case "setPageGrowth":
      return pages[event.pageId] === undefined
        ? err("page-not-found")
        : ok(undefined)
    case "deletePage": {
      if (pages[event.pageId] === undefined) return err("page-not-found")
      if (Object.keys(pages).length <= 1) return err("last-page")
      const occupied = Object.values(state.occupancy).some(
        (token) => zones[token.zoneId]?.pageId === event.pageId
      )
      return occupied ? err("page-occupied") : ok(undefined)
    }
    case "duplicatePage":
      if (pages[event.sourcePageId] === undefined) return err("page-not-found")
      if (pages[event.newPageId] !== undefined) return err("identity-collision")
      if (
        Object.values(event.zoneIdMap).some((id) => zones[id] !== undefined) ||
        Object.values(event.connectionIdMap).some(
          (id) => connections[id] !== undefined
        )
      )
        return err("identity-collision")
      return ok(undefined)
    case "moveZoneToPage":
      if (zones[event.zoneId] === undefined) return err("zone-not-found")
      return pages[event.pageId] === undefined
        ? err("page-not-found")
        : ok(undefined)
  }
}
