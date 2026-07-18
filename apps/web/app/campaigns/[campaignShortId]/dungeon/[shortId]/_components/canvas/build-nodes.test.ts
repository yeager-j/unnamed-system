import { describe, expect, it } from "vitest"

import { buildNodes } from "./build-nodes"

// Hand-built fixture — this tier is engine-gated (no @workspace/game* imports,
// engine fixtures included), so the instance literal is typed structurally.
const zone = (id: string, pageId: string, x = 0) => ({
  id,
  name: id,
  description: "",
  dmNotes: "",
  position: { x, y: 0 },
  pageId,
  size: "M" as const,
})

/** Stub-ghost node derivation (UNN-590, D8) — the DM exploration board floats an
 *  inert dashed ghost per stub on the active page; combat skips ghosts. */
describe("buildNodes — stub ghosts", () => {
  const instance = {
    geometry: {
      pages: {
        default: { id: "default", name: "default" },
        p2: { id: "p2", name: "p2" },
      },
      zones: {
        z1: zone("z1", "default"),
        "z-far": zone("z-far", "p2", 900),
      },
      connections: {},
    },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: {
      zones: {},
      stubs: {
        "stub-1": {
          id: "stub-1",
          zoneId: "z1",
          bearing: 0, // due east
          anchor: { side: "e" as const, offset: 0.5 },
        },
        "stub-off-page": {
          id: "stub-off-page",
          zoneId: "z-far",
          bearing: 0,
          anchor: { side: "e" as const, offset: 0.5 },
        },
      },
      connections: {},
      grafts: {},
    },
    lastMovedTokenKey: null,
  }

  it("emits an inert ghost node per stub on the active page, east of its parent", () => {
    const nodes = buildNodes(instance, { kind: "play", roster: {} }, "default")
    const ghosts = nodes.filter((node) => node.type === "stubGhost")
    expect(ghosts).toHaveLength(1)
    const ghost = ghosts[0]!
    expect(ghost.id).toBe("stub-ghost-stub-1")
    expect(ghost.draggable).toBe(false)
    expect(ghost.selectable).toBe(false)
    expect(ghost.data).toEqual({ stubId: "stub-1", parentZoneName: "z1" })
    // Due-east bearing: the ghost's center sits right of the parent's center,
    // at the parent's vertical midline.
    const parentCenter = { x: 336 / 2, y: 192 / 2 }
    expect(ghost.position.x).toBeGreaterThan(parentCenter.x)
    expect(ghost.position.y).toBeCloseTo(parentCenter.y - 72 / 2, 5)
  })

  it("skips stubs whose parent sits on another page", () => {
    const nodes = buildNodes(instance, { kind: "play", roster: {} }, "p2")
    const ghosts = nodes.filter((node) => node.type === "stubGhost")
    expect(ghosts.map((ghost) => ghost.id)).toEqual([
      "stub-ghost-stub-off-page",
    ])
  })

  it("combat mode draws no ghosts", () => {
    const nodes = buildNodes(
      instance,
      {
        kind: "combat",
        roster: {
          players: [],
          enemies: [],
          enemyCount: 0,
          downedEnemyCount: 0,
        },
      },
      "default"
    )
    expect(nodes.some((node) => node.type === "stubGhost")).toBe(false)
  })
})
