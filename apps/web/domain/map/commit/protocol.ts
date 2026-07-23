import { z } from "zod/v4"

import {
  mapGeometryEventSchema,
  reduceMapGeometry,
  type MapGeometry,
  type MapGeometryEvent,
} from "@workspace/game-v2/spatial"
import { defineMutation, defineProtocol } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

export interface MapCanonValue {
  name: string
  geometry: MapGeometry
}

export const mapRenameArgs = z.object({
  mapId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
})

export const mapGeometryEventsArgs = z.object({
  mapId: z.string().min(1),
  events: z.array(mapGeometryEventSchema).min(1),
})

export type MapRenameArgs = z.infer<typeof mapRenameArgs>
export type MapGeometryEventsArgs = z.infer<typeof mapGeometryEventsArgs>

export const mapRename = defineMutation({
  name: "map.rename",
  args: mapRenameArgs,
  refusal: z.never(),
  predict(
    state: MapCanonValue,
    args: MapRenameArgs
  ): Result<MapCanonValue, never> {
    return ok({ ...state, name: args.name })
  },
})

export const mapGeometryEvents = defineMutation({
  name: "map.geometry-events",
  args: mapGeometryEventsArgs,
  refusal: z.literal("map-event-refused"),
  predict(
    state: MapCanonValue,
    args: MapGeometryEventsArgs
  ): Result<MapCanonValue, "map-event-refused"> {
    try {
      return ok({
        ...state,
        geometry: reduceMapGeometryEvents(state.geometry, args.events),
      })
    } catch {
      return err("map-event-refused")
    }
  },
})

export function reduceMapGeometryEvents(
  geometry: MapGeometry,
  events: readonly MapGeometryEvent[]
): MapGeometry {
  let current = geometry
  for (const event of events) {
    const createdIdTaken =
      (event.kind === "addZone" && current.zones[event.id] !== undefined) ||
      (event.kind === "duplicateZone" &&
        current.zones[event.newId] !== undefined) ||
      (event.kind === "addConnection" &&
        current.connections[event.id] !== undefined) ||
      (event.kind === "addPage" && current.pages[event.id] !== undefined) ||
      (event.kind === "duplicatePage" &&
        current.pages[event.newPageId] !== undefined)
    if (createdIdTaken) throw new Error("map geometry event id is already used")
    if (event.kind === "duplicatePage") {
      const sourceZoneIds = Object.values(current.zones)
        .filter((zone) => zone.pageId === event.sourcePageId)
        .map((zone) => zone.id)
        .sort()
      const mappedZoneIds = Object.keys(event.zoneIdMap).sort()
      const sourceConnectionIds = Object.values(current.connections)
        .filter(
          (connection) =>
            current.zones[connection.fromZoneId]?.pageId ===
              event.sourcePageId &&
            current.zones[connection.toZoneId]?.pageId === event.sourcePageId
        )
        .map((connection) => connection.id)
        .sort()
      const mappedConnectionIds = Object.keys(event.connectionIdMap).sort()
      const newZoneIds = Object.values(event.zoneIdMap)
      const newConnectionIds = Object.values(event.connectionIdMap)
      const mappingIsComplete =
        sourceZoneIds.join("\0") === mappedZoneIds.join("\0") &&
        sourceConnectionIds.join("\0") === mappedConnectionIds.join("\0")
      const newIdsAreAvailable =
        new Set(newZoneIds).size === newZoneIds.length &&
        newZoneIds.every((id) => current.zones[id] === undefined) &&
        new Set(newConnectionIds).size === newConnectionIds.length &&
        newConnectionIds.every((id) => current.connections[id] === undefined)
      if (!mappingIsComplete || !newIdsAreAvailable) {
        throw new Error("map page duplication no longer matches current state")
      }
    }
    const next = reduceMapGeometry(current, event)
    if (next === current) throw new Error("map geometry event refused")
    current = next
  }
  return current
}

export const mapProtocol = defineProtocol({
  id: "showtime.map.v1",
  mutations: [mapRename, mapGeometryEvents],
})
