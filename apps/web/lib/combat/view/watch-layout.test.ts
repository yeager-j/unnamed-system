import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  SpatialEncounterSnapshot,
  VisibleCombatant,
} from "@workspace/game-v2/visibility"

import { buildWatchView } from "./watch-layout"

const FRESH_TURN = {
  movesUsed: 0,
  standardsUsed: 0,
  reactionsUsed: 0,
  turnsTakenThisRound: 0,
}

function visible(
  id: string,
  components: VisibleCombatant["components"]
): VisibleCombatant {
  return { id: asParticipantId(id), components }
}

/** A redacted snapshot: a PC and two same-named goblins in the Hall (both
 *  sides — engaged), one combatant fog-clamped to `""`, one on a stale zone. */
const snapshot: SpatialEncounterSnapshot = {
  status: "live",
  name: "Bridge ambush",
  campaignShortId: "camp",
  version: 1,
  instanceVersion: 1,
  round: 2,
  currentActor: { id: asParticipantId("hero"), name: "Roan", side: "players" },
  combatants: [
    visible("hero", {
      identity: { name: "Roan" },
      allegiance: { side: "players" },
      turnState: FRESH_TURN,
      position: { zoneId: "z1" },
      vitals: { currentHP: 12, maxHP: 16 },
      skillPool: { currentSP: 3, maxSP: 5 },
      ailments: ["burn"],
    }),
    visible("gob-1", {
      identity: { name: "Goblin" },
      allegiance: { side: "enemies" },
      turnState: { ...FRESH_TURN, turnsTakenThisRound: 1 },
      position: { zoneId: "z1" },
    }),
    visible("gob-2", {
      identity: { name: "Goblin" },
      allegiance: { side: "enemies" },
      turnState: FRESH_TURN,
      position: { zoneId: "" },
    }),
    visible("gob-3", {
      identity: { name: "Straggler" },
      allegiance: { side: "enemies" },
      turnState: FRESH_TURN,
      position: { zoneId: "gone" },
    }),
  ],
  zones: [
    { id: "z1", name: "Hall" },
    { id: "z2", name: "Cave" },
  ],
  connections: [
    { id: "z1-z2", fromZoneId: "z1", toZoneId: "z2", locked: false },
  ],
  exits: [],
  enchantment: { zoneId: "z2", type: "requiem", forte: 1 },
}

describe("buildWatchView", () => {
  it("disambiguates duplicate names in snapshot order", () => {
    const view = buildWatchView(snapshot)

    expect(view.combatants.map((c) => c.name)).toEqual([
      "Roan",
      "Goblin",
      "Goblin 2",
      "Straggler",
    ])
    expect(view.enemies.map((c) => c.name)).toEqual([
      "Goblin",
      "Goblin 2",
      "Straggler",
    ])
  })

  it("renders redaction structurally: dropped vitals mean null, never 0/0", () => {
    const view = buildWatchView(snapshot)
    const [hero, gob] = view.combatants

    expect(hero).toMatchObject({
      hp: { current: 12, max: 16 },
      sp: { current: 3, max: 5 },
      isCurrent: true,
      ailments: ["burn"],
    })
    expect(gob).toMatchObject({ hp: null, sp: null, hasActed: true })
  })

  it("flags a zone engaged only when both sides stand in it", () => {
    const view = buildWatchView(snapshot)
    const [hall, cave] = view.layout.zones

    expect(hall).toMatchObject({ name: "Hall", engaged: true })
    expect(hall?.combatants.map((c) => c.name)).toEqual(["Roan", "Goblin"])
    expect(cave).toMatchObject({ name: "Cave", engaged: false })
  })

  it("buckets fog-clamped and stale placements into unplaced", () => {
    const view = buildWatchView(snapshot)

    expect(view.layout.unplaced.map((c) => c.name)).toEqual([
      "Goblin 2",
      "Straggler",
    ])
    expect(view.layout.hasZones).toBe(true)
  })

  it("rides the enchantment badge on its zone and names adjacency", () => {
    const view = buildWatchView(snapshot)
    const [hall, cave] = view.layout.zones

    expect(hall?.enchantment).toBeUndefined()
    expect(cave?.enchantment).toMatchObject({ type: "requiem", forte: 1 })
    expect(hall?.adjacentZoneNames).toEqual(["Cave"])
    expect(cave?.adjacentZoneNames).toEqual(["Hall"])
  })
})
