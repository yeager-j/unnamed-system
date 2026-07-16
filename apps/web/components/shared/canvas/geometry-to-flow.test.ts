import { describe, expect, it } from "vitest"

import { mapGeometrySchema, type MapGeometry } from "@workspace/game-v2/spatial"

import { geometryToFlow } from "./geometry-to-flow"

function makeGeometry(partial?: Partial<MapGeometry>): MapGeometry {
  return mapGeometrySchema.parse(partial ?? {})
}

describe("geometryToFlow", () => {
  it("maps an empty geometry to empty arrays", () => {
    expect(geometryToFlow(makeGeometry())).toEqual({ nodes: [], edges: [] })
  })

  it("maps each zone to a typed node carrying its position and data", () => {
    const geometry = makeGeometry({
      zones: {
        a: {
          id: "a",
          name: "Crypt",
          description: "d",
          dmNotes: "n",
          position: { x: 5, y: 7 },
          pageId: "default",
        },
      },
    })

    const { nodes } = geometryToFlow(geometry)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      id: "a",
      type: "zone",
      position: { x: 5, y: 7 },
      data: { zone: geometry.zones["a"] },
    })
  })

  it("maps a connection's from/to onto edge source/target", () => {
    const geometry = makeGeometry({
      zones: {
        a: {
          id: "a",
          name: "A",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: "default",
        },
        b: {
          id: "b",
          name: "B",
          description: "",
          dmNotes: "",
          position: { x: 1, y: 1 },
          pageId: "default",
        },
      },
      connections: {
        ab: {
          id: "ab",
          fromZoneId: "a",
          toZoneId: "b",
          hidden: true,
          locked: false,
        },
      },
    })

    const { edges } = geometryToFlow(geometry)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      id: "ab",
      type: "connection",
      source: "a",
      target: "b",
      data: { connection: geometry.connections["ab"] },
    })
  })
})
