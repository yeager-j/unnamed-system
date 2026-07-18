import { produce } from "immer"

import type { MapGeometryEvent } from "./geometry-event"
import type { MapGeometry } from "./geometry.schema"
import { doomedZoneIdsFor } from "./pages"

/**
 * The pure Map-**template** geometry reducer (S2; ports v1 `engine/map/
 * reduce-map-geometry.ts`, D2): applies one {@link MapGeometryEvent} to an immutable
 * {@link MapGeometry}, returning the next geometry. The authoring counterpart to
 * {@link import("./reduce-map-instance").reduceMapInstance} — same conventions: a
 * **decider** (deterministic, no I/O), **Immer**-drafted, and a **grouped exhaustive
 * `switch` with no `default`** so a new event kind fails to compile until handled —
 * but over bare {@link MapGeometry} rather than the Map-Instance. It is **not**
 * curried: the My Maps template autosaves the whole `geometry` blob (it is not
 * event-sourced), and the canvas mints ids itself so it knows the new id up front for
 * the optimistic React-Flow node/edge it pushes — so ids ride on the events, and there
 * is no `newId`/`GameData` dependency to inject. Kept a **separate reducer** from the
 * Map-Instance because the My Maps editor consumes it standalone (SD6).
 *
 * Every edit keeps the blob **valid against `mapGeometrySchema`**: names stay
 * non-empty (empty renames no-op), connections never duplicate or self-loop, and
 * deleting a Zone cascades the connections that reference it. An edit naming an unknown
 * id is a no-op — and because the recipe then mutates no draft, Immer returns the
 * **same reference**, which the canvas relies on (`next === geometryRef.current` skips
 * redundant work).
 *
 * The Map-Instance re-homes geometry edits via its `editGeometry` event, **delegating**
 * to this reducer over `state.geometry`, then layering Instance-only reconciliation
 * (block deleting an occupied Zone; reconcile reveal/enchantment with the new geometry)
 * — see {@link import("./reduce-map-instance").reduceMapInstance}.
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
    case "setZoneIdentity":
    case "setZoneBinding":
    case "moveZone":
    case "deleteZone":
    case "setEntryZone":
      return reduceZoneEvent(geometry, event)

    case "addConnection":
    case "setConnectionFlag":
    case "deleteConnection":
      return reduceConnectionEvent(geometry, event)

    case "addPage":
    case "renamePage":
    case "deletePage":
    case "duplicatePage":
    case "moveZoneToPage":
    case "setPageGrowth":
      return reducePageEvent(geometry, event)
  }
}

/**
 * Zone-slice edits — add/duplicate/rename/retext/rebind/move/delete a Zone, plus
 * the geometry-level entry-Zone designation (it names a Zone, so it lives with the
 * Zone slice). `deleteZone` also cascades every connection that referenced the
 * removed Zone (connections are undirected, so either endpoint matches) and clears
 * a dangling `entryZoneId`. Each event no-ops on an unknown Zone id (Immer returns
 * the input untouched when no draft mutates).
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
        | "setZoneIdentity"
        | "setZoneBinding"
        | "moveZone"
        | "deleteZone"
        | "setEntryZone"
    }
  >
): MapGeometry {
  return produce(geometry, (draft) => {
    switch (event.kind) {
      case "addZone": {
        if (geometry.pages[event.pageId] === undefined) return
        draft.zones[event.id] = {
          id: event.id,
          name: nextZoneName(geometry.zones),
          description: "",
          dmNotes: "",
          position: event.position,
          pageId: event.pageId,
        }
        return
      }

      case "duplicateZone": {
        const source = geometry.zones[event.sourceId]
        if (source === undefined || geometry.pages[event.pageId] === undefined)
          return
        draft.zones[event.newId] = {
          ...source,
          id: event.newId,
          name: `${source.name} copy`,
          position: event.position,
          pageId: event.pageId,
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

      case "setZoneIdentity": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        const { size, motif, mood } = event.identity
        if (size !== undefined) zone.size = size
        if (mood !== undefined) zone.mood = mood
        // `motif: null` is the clear opcode — delete the key so a cleared Zone
        // deep-equals a never-set one (the load-schema fixed-point law); an absent
        // `motif` leaves the current value untouched.
        if (motif === null) delete zone.motif
        else if (motif !== undefined) zone.motif = motif
        return
      }

      case "setZoneBinding": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        const { templateKey, portalMapId, rollContentsAtStart } = event.binding
        // `null` is the clear opcode — delete the key so a cleared Zone
        // deep-equals a never-set one; absent leaves the value untouched.
        if (templateKey === null) delete zone.templateKey
        else if (templateKey !== undefined) zone.templateKey = templateKey
        if (portalMapId === null) delete zone.portalMapId
        else if (portalMapId !== undefined) zone.portalMapId = portalMapId
        if (rollContentsAtStart === null) delete zone.rollContentsAtStart
        else if (rollContentsAtStart !== undefined)
          zone.rollContentsAtStart = rollContentsAtStart
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
        // Keep the geometry self-consistent: a deleted entry Zone clears the
        // designation (graft-time apply also filters, but the blob shouldn't
        // carry a knowingly dangling ref).
        if (geometry.entryZoneId === event.zoneId) delete draft.entryZoneId
        return
      }

      case "setEntryZone": {
        if (event.zoneId === null) {
          if (geometry.entryZoneId !== undefined) delete draft.entryZoneId
          return
        }
        if (draft.zones[event.zoneId] === undefined) return
        if (geometry.entryZoneId === event.zoneId) return
        draft.entryZoneId = event.zoneId
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
 * Page-slice edits (UNN-586) — add/rename/delete/duplicate a page, or move a Zone
 * between pages. Invariants preserved: a geometry always keeps ≥ 1 page
 * (`deletePage` no-ops on the last one), and `deletePage` cascades the page's
 * Zones plus every connection touching them — cross-page links sever, exactly as
 * `deleteZone` would one Zone at a time. `duplicatePage` deep-copies with
 * **caller-minted** id maps (deterministic replay: the Instance re-reduces the
 * same event server-side); a map entry naming an unknown source Zone or a taken
 * new id is skipped rather than corrupting the copy.
 */
function reducePageEvent(
  geometry: MapGeometry,
  event: Extract<
    MapGeometryEvent,
    {
      kind:
        | "addPage"
        | "renamePage"
        | "deletePage"
        | "duplicatePage"
        | "moveZoneToPage"
        | "setPageGrowth"
    }
  >
): MapGeometry {
  return produce(geometry, (draft) => {
    switch (event.kind) {
      case "addPage": {
        if (geometry.pages[event.id] !== undefined) return
        const trimmed = event.name?.trim()
        draft.pages[event.id] = {
          id: event.id,
          name:
            trimmed && trimmed.length > 0
              ? trimmed
              : nextPageName(geometry.pages),
        }
        return
      }

      case "renamePage": {
        const page = draft.pages[event.pageId]
        const trimmed = event.name.trim()
        if (page === undefined || trimmed.length === 0) return
        page.name = trimmed
        return
      }

      case "deletePage": {
        if (geometry.pages[event.pageId] === undefined) return
        if (Object.keys(geometry.pages).length <= 1) return
        delete draft.pages[event.pageId]
        const doomedZoneIds = doomedZoneIdsFor(geometry, event.pageId)
        for (const zoneId of doomedZoneIds) delete draft.zones[zoneId]
        for (const [connId, conn] of Object.entries(geometry.connections)) {
          if (
            doomedZoneIds.has(conn.fromZoneId) ||
            doomedZoneIds.has(conn.toZoneId)
          ) {
            delete draft.connections[connId]
          }
        }
        if (
          geometry.entryZoneId !== undefined &&
          doomedZoneIds.has(geometry.entryZoneId)
        ) {
          delete draft.entryZoneId
        }
        return
      }

      case "duplicatePage": {
        const source = geometry.pages[event.sourcePageId]
        if (source === undefined) return
        if (geometry.pages[event.newPageId] !== undefined) return
        draft.pages[event.newPageId] = {
          ...source,
          id: event.newPageId,
          name: `${source.name} copy`,
        }
        for (const [sourceZoneId, newZoneId] of Object.entries(
          event.zoneIdMap
        )) {
          const zone = geometry.zones[sourceZoneId]
          if (
            zone === undefined ||
            zone.pageId !== event.sourcePageId ||
            geometry.zones[newZoneId] !== undefined
          ) {
            continue
          }
          draft.zones[newZoneId] = {
            ...zone,
            id: newZoneId,
            pageId: event.newPageId,
          }
        }
        for (const [sourceConnId, newConnId] of Object.entries(
          event.connectionIdMap
        )) {
          const conn = geometry.connections[sourceConnId]
          if (
            conn === undefined ||
            geometry.connections[newConnId] !== undefined
          )
            continue
          const newFrom = event.zoneIdMap[conn.fromZoneId]
          const newTo = event.zoneIdMap[conn.toZoneId]
          // Both endpoints must have been copied — an intra-page connection by
          // construction; cross-page links are deliberately not duplicated.
          if (newFrom === undefined || newTo === undefined) continue
          if (
            draft.zones[newFrom] === undefined ||
            draft.zones[newTo] === undefined
          ) {
            continue
          }
          draft.connections[newConnId] = {
            ...conn,
            id: newConnId,
            fromZoneId: newFrom,
            toZoneId: newTo,
          }
        }
        return
      }

      case "moveZoneToPage": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        if (geometry.pages[event.pageId] === undefined) return
        if (zone.pageId === event.pageId) return
        zone.pageId = event.pageId
        return
      }

      case "setPageGrowth": {
        const page = draft.pages[event.pageId]
        if (page === undefined) return
        // `null` clears the key (back to the consumer-side `edge` default) so a
        // cleared page deep-equals a never-set one.
        if (event.growth === null) delete page.growth
        else page.growth = event.growth
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

/** The default name for a freshly-added page — the lowest free `Page N`, mirroring
 *  {@link nextZoneName}. */
function nextPageName(pages: MapGeometry["pages"]): string {
  const taken = new Set(Object.values(pages).map((page) => page.name))
  let n = 1
  while (taken.has(`Page ${n}`)) n += 1
  return `Page ${n}`
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
