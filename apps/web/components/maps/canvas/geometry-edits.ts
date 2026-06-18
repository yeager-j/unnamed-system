import {
  type MapConnection,
  type MapGeometry,
  type MapZone,
} from "@workspace/game/foundation"

/**
 * Pure, immutable edits over a {@link MapGeometry} — the authoring mutations the
 * React Flow canvas (UNN-461) applies as the DM builds a Map. The Map **template**
 * has no reducer by design (it autosaves as one whole `geometry` blob, unlike the
 * event-sourced Map Instance), so these are plain functions: geometry in, a new
 * geometry out, never mutating the input.
 *
 * Every edit keeps the blob **valid against `mapGeometrySchema`** so it always
 * round-trips through `saveMapAction` — names stay non-empty (empty renames no-op),
 * connections never duplicate or self-loop, and deleting a Zone cascades the
 * connections that reference it. An edit naming an unknown id is a no-op.
 *
 * Ids are minted by the **caller** (`crypto.randomUUID()`, matching
 * {@link import("@/lib/db/writes/inventory")}) and passed in, so the canvas knows
 * the new id for selection and these stay deterministically testable.
 */

type Point = MapZone["position"]

/** A connection's two independent fog/access flags (§3.5). */
export type ConnectionFlag = "hidden" | "locked"

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

/** Adds a Zone at `position` with a unique default name. */
export function addZone(
  geometry: MapGeometry,
  id: string,
  position: Point
): MapGeometry {
  const zone: MapZone = {
    id,
    name: nextZoneName(geometry.zones),
    description: "",
    dmNotes: "",
    position,
  }
  return { ...geometry, zones: { ...geometry.zones, [id]: zone } }
}

/**
 * Duplicates a Zone — a fresh copy of its text (name, description, DM notes) at a
 * new position, with **no** connections carried over. The caller mints `newId` and
 * picks `position` (the canvas offsets it from the source). A no-op on an unknown
 * `sourceId`.
 */
export function duplicateZone(
  geometry: MapGeometry,
  sourceId: string,
  newId: string,
  position: Point
): MapGeometry {
  const source = geometry.zones[sourceId]
  if (!source) return geometry
  const copy: MapZone = {
    ...source,
    id: newId,
    name: `${source.name} copy`,
    position,
  }
  return { ...geometry, zones: { ...geometry.zones, [newId]: copy } }
}

/** Renames a Zone. Trims; an empty name is a no-op (the schema requires ≥1 char). */
export function renameZone(
  geometry: MapGeometry,
  zoneId: string,
  name: string
): MapGeometry {
  const zone = geometry.zones[zoneId]
  const trimmed = name.trim()
  if (!zone || trimmed.length === 0) return geometry
  return {
    ...geometry,
    zones: { ...geometry.zones, [zoneId]: { ...zone, name: trimmed } },
  }
}

/** Patches a Zone's player-facing `description` and/or private `dmNotes`. */
export function setZoneText(
  geometry: MapGeometry,
  zoneId: string,
  patch: Partial<Pick<MapZone, "description" | "dmNotes">>
): MapGeometry {
  const zone = geometry.zones[zoneId]
  if (!zone) return geometry
  return {
    ...geometry,
    zones: { ...geometry.zones, [zoneId]: { ...zone, ...patch } },
  }
}

/** Moves a Zone's node — the `(x, y)` layout the canvas persists on drag. */
export function moveZone(
  geometry: MapGeometry,
  zoneId: string,
  position: Point
): MapGeometry {
  const zone = geometry.zones[zoneId]
  if (!zone) return geometry
  return {
    ...geometry,
    zones: { ...geometry.zones, [zoneId]: { ...zone, position } },
  }
}

/** Deletes a Zone and cascades every connection that referenced it. */
export function deleteZone(geometry: MapGeometry, zoneId: string): MapGeometry {
  if (!geometry.zones[zoneId]) return geometry

  const zones = { ...geometry.zones }
  delete zones[zoneId]

  const connections = Object.fromEntries(
    Object.entries(geometry.connections).filter(
      ([, connection]) =>
        connection.fromZoneId !== zoneId && connection.toZoneId !== zoneId
    )
  )

  return { zones, connections }
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

/**
 * Adds an undirected connection between two Zones. No-ops on a self-loop, an
 * unknown endpoint, or a duplicate of an existing edge (either direction).
 */
export function addConnection(
  geometry: MapGeometry,
  id: string,
  fromZoneId: string,
  toZoneId: string
): MapGeometry {
  if (
    fromZoneId === toZoneId ||
    !geometry.zones[fromZoneId] ||
    !geometry.zones[toZoneId] ||
    connectionExists(geometry.connections, fromZoneId, toZoneId)
  ) {
    return geometry
  }

  const connection: MapConnection = {
    id,
    fromZoneId,
    toZoneId,
    hidden: false,
    locked: false,
  }
  return {
    ...geometry,
    connections: { ...geometry.connections, [id]: connection },
  }
}

/** Sets one of a connection's independent `hidden`/`locked` flags. */
export function setConnectionFlag(
  geometry: MapGeometry,
  connectionId: string,
  flag: ConnectionFlag,
  value: boolean
): MapGeometry {
  const connection = geometry.connections[connectionId]
  if (!connection) return geometry
  return {
    ...geometry,
    connections: {
      ...geometry.connections,
      [connectionId]: { ...connection, [flag]: value },
    },
  }
}

/** Deletes a connection. */
export function deleteConnection(
  geometry: MapGeometry,
  connectionId: string
): MapGeometry {
  if (!geometry.connections[connectionId]) return geometry
  const connections = { ...geometry.connections }
  delete connections[connectionId]
  return { ...geometry, connections }
}
