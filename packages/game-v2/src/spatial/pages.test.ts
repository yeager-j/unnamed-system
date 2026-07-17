import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGeometry,
  makePage,
  makeZone,
} from "./__fixtures__/spatial"
import { DEFAULT_PAGE_ID } from "./geometry.schema"
import {
  crossPageLinksForPage,
  firstPageId,
  isCrossPage,
  orderedPages,
  pageDeleteImpact,
  pageOfZone,
} from "./pages"
import { reduceMapGeometry } from "./reduce-map-geometry"

/** default page ("default") with zones a/b, page p2 ("Undercroft") with zones
 *  c/d; connections: ab (intra-default), cd (intra-p2), bc (cross-page). */
const geometry = makeGeometry(
  [
    makeZone("a"),
    makeZone("b"),
    makeZone("c", { name: "Ossuary", pageId: "p2" }),
    makeZone("d", { pageId: "p2" }),
  ],
  [
    makeConnection("ab", "a", "b"),
    makeConnection("cd", "c", "d"),
    makeConnection("bc", "b", "c"),
  ],
  [
    makePage(DEFAULT_PAGE_ID, { name: "Page 1" }),
    makePage("p2", { name: "Undercroft" }),
  ]
)

describe("orderedPages / firstPageId", () => {
  it("orders by (name, id), independent of record key order", () => {
    const shuffled = {
      ...geometry,
      pages: {
        p2: geometry.pages["p2"]!,
        [DEFAULT_PAGE_ID]: geometry.pages[DEFAULT_PAGE_ID]!,
      },
    }
    expect(orderedPages(shuffled).map((p) => p.id)).toEqual([
      DEFAULT_PAGE_ID,
      "p2",
    ])
    expect(firstPageId(shuffled)).toBe(DEFAULT_PAGE_ID)
  })

  it("breaks a name tie by id", () => {
    const tied = makeGeometry(
      [],
      [],
      [makePage("z", { name: "Floor" }), makePage("a", { name: "Floor" })]
    )
    expect(orderedPages(tied).map((p) => p.id)).toEqual(["a", "z"])
  })
})

describe("pageOfZone / isCrossPage", () => {
  it("resolves a zone's page and derives cross-page-ness from endpoints", () => {
    expect(pageOfZone(geometry, "a")).toBe(DEFAULT_PAGE_ID)
    expect(pageOfZone(geometry, "ghost")).toBeUndefined()
    expect(isCrossPage(geometry, geometry.connections["ab"]!)).toBe(false)
    expect(isCrossPage(geometry, geometry.connections["bc"]!)).toBe(true)
  })

  it("treats a dangling endpoint as not cross-page", () => {
    const dangling = makeConnection("bx", "b", "ghost")
    expect(isCrossPage(geometry, dangling)).toBe(false)
  })
})

describe("crossPageLinksForPage", () => {
  it("returns the on-page endpoint's chip data for each cross-page connection", () => {
    expect(crossPageLinksForPage(geometry, DEFAULT_PAGE_ID)).toEqual([
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
    expect(crossPageLinksForPage(geometry, "p2")).toEqual([
      {
        connectionId: "bc",
        zoneId: "c",
        farZoneId: "b",
        farZoneName: "b",
        farPageId: DEFAULT_PAGE_ID,
        farPageName: "Page 1",
        hidden: false,
        locked: false,
      },
    ])
  })
})

describe("pageDeleteImpact", () => {
  it("counts doomed zones, intra-page connections, and severed cross-page links", () => {
    expect(pageDeleteImpact(geometry, DEFAULT_PAGE_ID)).toEqual({
      zoneCount: 2,
      intraConnectionCount: 1,
      severedCrossPageCount: 1,
    })
  })

  it("agrees exactly with what deletePage actually removes", () => {
    const impact = pageDeleteImpact(geometry, "p2")
    const next = reduceMapGeometry(geometry, {
      kind: "deletePage",
      pageId: "p2",
    })
    expect(
      Object.keys(geometry.zones).length - Object.keys(next.zones).length
    ).toBe(impact.zoneCount)
    expect(
      Object.keys(geometry.connections).length -
        Object.keys(next.connections).length
    ).toBe(impact.intraConnectionCount + impact.severedCrossPageCount)
  })
})
