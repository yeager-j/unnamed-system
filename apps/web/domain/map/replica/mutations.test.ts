import { describe, expect, it } from "vitest"

import { emptyMapInstance, reduceMapInstance } from "@workspace/game-v2/spatial"

import {
  mapInstanceMutations,
  prepareMapInstanceInvocation,
  type MapInstanceReplicaState,
} from "./mutations"

function mapState(): MapInstanceReplicaState {
  const empty = emptyMapInstance()
  const withA = reduceMapInstance(() => "unused")(empty, {
    kind: "editGeometry",
    event: {
      kind: "addZone",
      id: "a",
      pageId: "default",
      position: { x: 0, y: 0 },
    },
  })
  const withB = reduceMapInstance(() => "unused")(withA, {
    kind: "editGeometry",
    event: {
      kind: "addZone",
      id: "b",
      pageId: "default",
      position: { x: 100, y: 0 },
    },
  })
  return { state: withB, status: "open" }
}

function apply(
  root: MapInstanceReplicaState,
  invocation: ReturnType<typeof prepareMapInstanceInvocation>
) {
  return mapInstanceMutations
    .get(invocation.name)!
    .apply(root, invocation.args, { phase: "rebase" })
}

describe("Map Instance Replica mutations", () => {
  it("mints stable identities before an optimistic event enters the log", () => {
    const zone = prepareMapInstanceInvocation(
      mapState().state,
      { kind: "addZone", name: "C" },
      () => "zone-c"
    )
    expect(zone.args.event).toMatchObject({ zoneId: "zone-c" })

    const connection = prepareMapInstanceInvocation(
      mapState().state,
      { kind: "setZoneAdjacency", zoneIdA: "a", zoneIdB: "b", adjacent: true },
      () => "edge-ab"
    )
    expect(connection.args.event).toMatchObject({ connectionId: "edge-ab" })
  })

  it("rebases desired-state edits over unrelated accepted changes", () => {
    const initial = mapState()
    const invocation = prepareMapInstanceInvocation(initial.state, {
      kind: "renameZone",
      zoneId: "a",
      name: "Atrium",
    })
    const accepted = {
      ...initial,
      state: reduceMapInstance(() => "unused")(initial.state, {
        kind: "renameZone",
        zoneId: "b",
        name: "Balcony",
      }),
    }

    const result = apply(accepted, invocation)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.state.geometry.zones.a?.name).toBe("Atrium")
    expect(result.value.state.geometry.zones.b?.name).toBe("Balcony")
  })

  it("preserves an absent connection precondition across the wire", () => {
    const invocation = prepareMapInstanceInvocation(mapState().state, {
      kind: "setZoneAdjacency",
      zoneIdA: "a",
      zoneIdB: "b",
      adjacent: false,
    })

    expect(JSON.parse(JSON.stringify(invocation))).toEqual(invocation)
    expect(invocation.args).toMatchObject({ observed: null })
  })

  it("refuses a preconditioned placement when the token moved remotely", () => {
    const initial = mapState()
    const placed = {
      ...initial,
      state: reduceMapInstance(() => "unused")(initial.state, {
        kind: "placeCombatant",
        tokenKey: "pc-1",
        zoneId: "a",
      }),
    }
    const invocation = prepareMapInstanceInvocation(placed.state, {
      kind: "placeCombatant",
      tokenKey: "pc-1",
      zoneId: "b",
    })
    const movedRemotely = {
      ...placed,
      state: reduceMapInstance(() => "unused")(placed.state, {
        kind: "moveCombatant",
        tokenKey: "pc-1",
        toZoneId: "b",
      }),
    }

    expect(apply(movedRemotely, invocation)).toEqual({
      ok: false,
      error: "precondition-changed",
    })
  })

  it("refuses destructive edits that would remove occupied geometry", () => {
    const initial = mapState()
    const occupied = {
      ...initial,
      state: reduceMapInstance(() => "unused")(initial.state, {
        kind: "placeCombatant",
        tokenKey: "pc-1",
        zoneId: "a",
      }),
    }
    const invocation = prepareMapInstanceInvocation(occupied.state, {
      kind: "editGeometry",
      event: { kind: "deleteZone", zoneId: "a" },
    })

    expect(apply(occupied, invocation)).toEqual({
      ok: false,
      error: "zone-occupied",
    })
  })

  it("rejects every mutation after the aggregate is frozen", () => {
    const initial = mapState()
    const invocation = prepareMapInstanceInvocation(initial.state, {
      kind: "renameZone",
      zoneId: "a",
      name: "Closed",
    })

    expect(apply({ ...initial, status: "frozen" }, invocation)).toEqual({
      ok: false,
      error: "map-instance-frozen",
    })
  })

  it("preserves the aggregate reference for an accepted no-op", () => {
    const initial = mapState()
    const invocation = prepareMapInstanceInvocation(initial.state, {
      kind: "renameZone",
      zoneId: "a",
      name: initial.state.geometry.zones.a!.name,
    })

    const result = apply(initial, invocation)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(initial)
  })
})
