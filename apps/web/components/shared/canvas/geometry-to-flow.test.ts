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

  it("tolerates a dangling connection endpoint (edge dropped, no crash)", () => {
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
      },
      connections: {
        ax: {
          id: "ax",
          fromZoneId: "a",
          toZoneId: "ghost",
          hidden: false,
          locked: false,
        },
      },
    })

    const { nodes, edges } = geometryToFlow(geometry)
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
  })
})

describe("geometryToFlow — pages (UNN-586)", () => {
  /** Two pages: a/b on "default" (name "Page 1"), c on "p2" ("Undercroft");
   *  ab intra-page, bc cross-page. */
  const paged = makeGeometry({
    pages: {
      default: { id: "default", name: "Page 1" },
      p2: { id: "p2", name: "Undercroft" },
    },
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
      c: {
        id: "c",
        name: "Ossuary",
        description: "",
        dmNotes: "",
        position: { x: 2, y: 2 },
        pageId: "p2",
      },
    },
    connections: {
      ab: {
        id: "ab",
        fromZoneId: "a",
        toZoneId: "b",
        hidden: false,
        locked: false,
      },
      bc: {
        id: "bc",
        fromZoneId: "b",
        toZoneId: "c",
        hidden: false,
        locked: false,
      },
    },
  })

  it("defaults to the first page in canonical order", () => {
    const { nodes } = geometryToFlow(paged)
    expect(nodes.map((node) => node.id).sort()).toEqual(["a", "b"])
  })

  it("filters nodes to the active page and edges to intra-page connections", () => {
    const first = geometryToFlow(paged, "default")
    expect(first.nodes.map((node) => node.id).sort()).toEqual(["a", "b"])
    expect(first.edges.map((edge) => edge.id)).toEqual(["ab"])

    const second = geometryToFlow(paged, "p2")
    expect(second.nodes.map((node) => node.id)).toEqual(["c"])
    expect(second.edges).toHaveLength(0)
  })

  it("emits cross-page chip data on the on-page endpoint only", () => {
    const { nodes } = geometryToFlow(paged, "default")
    const nodeB = nodes.find((node) => node.id === "b")
    expect(nodeB?.data.crossPageLinks).toEqual([
      {
        connectionId: "bc",
        zoneId: "b",
        farZoneId: "c",
        farZoneName: "Ossuary",
        farPageId: "p2",
        farPageName: "Undercroft",
        hidden: false,
        locked: false,
      },
    ])
    const nodeA = nodes.find((node) => node.id === "a")
    expect(nodeA?.data.crossPageLinks).toEqual([])
  })
})
