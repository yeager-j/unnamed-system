import { z } from "zod/v4"

import { deepEqual } from "@workspace/game-v2/kernel/deep-equal"
import {
  GENERATION_INSTANCE_EVENT_KINDS,
  mapInstanceEventSchema,
  reduceMapInstance,
  validateDirectMapInstanceEvent,
  type DirectMapInstanceEvent,
  type DirectMapInstanceEventRefusal,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { MapInstanceStatus } from "@/lib/db/schema/map-instance"

export type MapInstanceReplicaEvent = DirectMapInstanceEvent

export function isMapInstanceReplicaEvent(
  event: unknown
): event is MapInstanceReplicaEvent {
  const parsed = mapInstanceEventSchema.safeParse(event)
  return (
    parsed.success &&
    !GENERATION_INSTANCE_EVENT_KINDS.includes(
      parsed.data.kind as (typeof GENERATION_INSTANCE_EVENT_KINDS)[number]
    )
  )
}

export interface MapInstanceReplicaState {
  readonly state: MapInstanceState
  readonly status: MapInstanceStatus
}

export type MapInstanceMutationRefusal =
  | DirectMapInstanceEventRefusal
  | "map-instance-frozen"
  | "precondition-changed"
  | "token-not-authorized"

export type MapInstanceReplicaRejection =
  | MapInstanceMutationRefusal
  | "forbidden"
  | "map-instance-not-found"
  | "invalid-state"
  | "invalid-write"

const replicaEventSchema = z.custom<MapInstanceReplicaEvent>((value) => {
  return isMapInstanceReplicaEvent(value)
})

const desiredArgsSchema = z.object({ event: replicaEventSchema })
const preconditionedArgsSchema = z.object({
  event: replicaEventSchema,
  observed: z.unknown(),
})
const DESIRED_STATE = Symbol("desired-state")

export const applyMapInstanceIntent = defineMutation({
  name: "map.instance.intent",
  args: desiredArgsSchema,
  apply(root: MapInstanceReplicaState, { event }) {
    return applyEvent(root, event)
  },
})

export const applyPreconditionedMapInstanceIntent = defineMutation({
  name: "map.instance.preconditioned",
  args: preconditionedArgsSchema,
  apply(root: MapInstanceReplicaState, { event, observed }) {
    const current = preconditionFor(root.state, event)
    if (current === DESIRED_STATE || !deepEqual(current, observed)) {
      return err<MapInstanceMutationRefusal>("precondition-changed")
    }
    return applyEvent(root, event)
  },
})

export type MapInstanceInvocation =
  | InvocationOf<typeof applyMapInstanceIntent>
  | InvocationOf<typeof applyPreconditionedMapInstanceIntent>

export const mapInstanceMutations: MutationRegistry<
  MapInstanceReplicaState,
  MapInstanceInvocation,
  MapInstanceReplicaRejection
> = defineMutations([
  applyMapInstanceIntent,
  applyPreconditionedMapInstanceIntent,
])

export function prepareMapInstanceInvocation(
  state: MapInstanceState,
  input: MapInstanceReplicaEvent,
  newId: () => string = () => crypto.randomUUID()
): MapInstanceInvocation {
  const event = stabilizeEvent(input, newId)
  const observed = preconditionFor(state, event)
  return observed === DESIRED_STATE
    ? applyMapInstanceIntent({ event })
    : applyPreconditionedMapInstanceIntent({ event, observed })
}

function stabilizeEvent(
  event: MapInstanceReplicaEvent,
  newId: () => string
): MapInstanceReplicaEvent {
  if (event.kind === "addZone" && event.zoneId === undefined) {
    return { ...event, zoneId: newId() }
  }
  if (
    event.kind === "setZoneAdjacency" &&
    event.adjacent &&
    event.connectionId === undefined
  ) {
    return { ...event, connectionId: newId() }
  }
  return event
}

function preconditionFor(
  state: MapInstanceState,
  event: MapInstanceReplicaEvent
): unknown | typeof DESIRED_STATE {
  if (event.kind === "placeCombatant") {
    return state.occupancy[event.tokenKey] ?? null
  }
  if (event.kind === "setZoneAdjacency") {
    if (event.adjacent) return DESIRED_STATE
    return (
      Object.values(state.geometry.connections).find(
        (connection) =>
          (connection.fromZoneId === event.zoneIdA &&
            connection.toZoneId === event.zoneIdB) ||
          (connection.fromZoneId === event.zoneIdB &&
            connection.toZoneId === event.zoneIdA)
      ) ?? null
    )
  }
  if (event.kind === "removeZone") {
    return removalFootprint(state, new Set([event.zoneId]))
  }
  if (event.kind !== "editGeometry") return DESIRED_STATE

  const geometryEvent = event.event
  if (geometryEvent.kind === "duplicateZone") {
    return {
      source: state.geometry.zones[geometryEvent.sourceId] ?? null,
      destination: state.geometry.zones[geometryEvent.newId] ?? null,
    }
  }
  if (geometryEvent.kind === "duplicatePage") {
    return {
      source: state.geometry.pages[geometryEvent.sourcePageId] ?? null,
      zones: Object.values(state.geometry.zones).filter(
        (zone) => zone.pageId === geometryEvent.sourcePageId
      ),
      connections: Object.values(state.geometry.connections).filter(
        (connection) =>
          geometryEvent.zoneIdMap[connection.fromZoneId] !== undefined &&
          geometryEvent.zoneIdMap[connection.toZoneId] !== undefined
      ),
      destinations: {
        page: state.geometry.pages[geometryEvent.newPageId] ?? null,
        zones: Object.values(geometryEvent.zoneIdMap).map(
          (id) => state.geometry.zones[id] ?? null
        ),
        connections: Object.values(geometryEvent.connectionIdMap).map(
          (id) => state.geometry.connections[id] ?? null
        ),
      },
    }
  }
  if (geometryEvent.kind === "deleteConnection") {
    const connection = state.geometry.connections[geometryEvent.connectionId]
    return {
      connection: connection ?? null,
      reveal: {
        revealed: state.reveal.revealedConnectionIds.includes(
          geometryEvent.connectionId
        ),
        unlocked: state.reveal.unlockedConnectionIds.includes(
          geometryEvent.connectionId
        ),
      },
      provenance:
        state.generation.connections[geometryEvent.connectionId] ?? null,
    }
  }
  if (
    geometryEvent.kind !== "deletePage" &&
    geometryEvent.kind !== "deleteZone"
  ) {
    return DESIRED_STATE
  }
  const zoneIds =
    geometryEvent.kind === "deletePage"
      ? new Set(
          Object.values(state.geometry.zones)
            .filter((zone) => zone.pageId === geometryEvent.pageId)
            .map((zone) => zone.id)
        )
      : geometryEvent.kind === "deleteZone"
        ? new Set([geometryEvent.zoneId])
        : new Set<string>()
  const footprint = removalFootprint(state, zoneIds)
  return geometryEvent.kind === "deletePage"
    ? {
        page: state.geometry.pages[geometryEvent.pageId] ?? null,
        footprint,
      }
    : footprint
}

function removalFootprint(
  state: MapInstanceState,
  zoneIds: ReadonlySet<string>
): unknown {
  const connectionIds = new Set(
    Object.values(state.geometry.connections)
      .filter(
        (connection) =>
          zoneIds.has(connection.fromZoneId) || zoneIds.has(connection.toZoneId)
      )
      .map((connection) => connection.id)
  )
  return {
    zones: Object.fromEntries(
      [...zoneIds].map((id) => [id, state.geometry.zones[id] ?? null])
    ),
    connections: Object.fromEntries(
      [...connectionIds].map((id) => [
        id,
        state.geometry.connections[id] ?? null,
      ])
    ),
    occupancy: Object.fromEntries(
      Object.entries(state.occupancy).filter(([, token]) =>
        zoneIds.has(token.zoneId)
      )
    ),
    generation: {
      zones: Object.fromEntries(
        [...zoneIds].map((id) => [id, state.generation.zones[id] ?? null])
      ),
      connections: Object.fromEntries(
        [...connectionIds].map((id) => [
          id,
          state.generation.connections[id] ?? null,
        ])
      ),
      stubs: Object.fromEntries(
        Object.entries(state.generation.stubs).filter(([, stub]) =>
          zoneIds.has(stub.zoneId)
        )
      ),
    },
    reveal: state.reveal,
    enchantment: state.enchantment,
    entryZoneId: state.geometry.entryZoneId ?? null,
  }
}

function applyEvent(
  root: MapInstanceReplicaState,
  event: MapInstanceReplicaEvent
): Result<MapInstanceReplicaState, MapInstanceMutationRefusal> {
  if (root.status !== "open") return err("map-instance-frozen")
  const valid = validateDirectMapInstanceEvent(root.state, event)
  if (!valid.ok) return valid

  const next = reduceMapInstance(() => deterministicCreatedId(event))(
    root.state,
    event
  )
  return ok(next === root.state ? root : { ...root, state: next })
}

function deterministicCreatedId(event: MapInstanceReplicaEvent): string {
  if (event.kind === "addZone" && event.zoneId !== undefined)
    return event.zoneId
  if (event.kind === "setZoneAdjacency" && event.connectionId !== undefined) {
    return event.connectionId
  }
  throw new Error(
    `Map Instance mutation ${event.kind} did not carry a stable id`
  )
}
