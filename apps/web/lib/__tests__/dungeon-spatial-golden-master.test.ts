import { describe, expect, it } from "vitest"

import {
  activeActedCharacterIds as v2ActiveActed,
  connectionFogState as v2Fog,
  isFogActive as v2FogActive,
  isConnectionLocked as v2Locked,
  reduceDungeon as v2Reduce,
  dungeonReminders as v2Reminders,
  isZoneRevealed as v2Revealed,
  deriveDungeonRoster as v2Roster,
} from "@workspace/game-v2/spatial"
import {
  activeActedCharacterIds as v1ActiveActed,
  connectionFogState as v1Fog,
  isFogActive as v1FogActive,
  isConnectionLocked as v1Locked,
  reduceDungeon as v1Reduce,
  dungeonReminders as v1Reminders,
  isZoneRevealed as v1Revealed,
  deriveDungeonRoster as v1Roster,
} from "@workspace/game/engine"

/**
 * **Golden-master parity (UNN-529).** The v1 spatial reducers + fog derivations are
 * the acceptance spec for their v2 re-homes (PRESERVE). v1 is the oracle — expected
 * values are never hand-coded — so a mis-ported branch in v2 fails loudly here. This
 * is the one place both engines are importable (game-v2 forbids `@workspace/game`,
 * D32), so the v1↔v2 cross-check lives in apps/web, not in-package.
 *
 * Scope is the behaviorally-identical surface: the dungeon turn loop, the derived
 * roster/reminder selectors, and the three-state connection fog derivation. The
 * player **snapshot** is intentionally *not* golden-mastered for deep equality — v2
 * deliberately SUPERSEDES its shape (drops v1's second enemy-redaction path, CD12),
 * so it is covered by its own in-package security gate instead.
 */

// One plain fixture shape, structurally valid for both engines' nominal types.
const conn = (
  id: string,
  fromZoneId: string,
  toZoneId: string,
  flags: { hidden?: boolean; locked?: boolean } = {}
) => ({
  id,
  fromZoneId,
  toZoneId,
  hidden: flags.hidden ?? false,
  locked: flags.locked ?? false,
})

const reveal = (
  overrides: {
    revealedZoneIds?: string[]
    revealedConnectionIds?: string[]
    unlockedConnectionIds?: string[]
  } = {}
) => ({
  revealedZoneIds: overrides.revealedZoneIds ?? [],
  revealedConnectionIds: overrides.revealedConnectionIds ?? [],
  unlockedConnectionIds: overrides.unlockedConnectionIds ?? [],
})

const dungeonState = (
  overrides: {
    turnCounter?: number
    actedCharacterIds?: string[]
    reminderSettings?: {
      randomEncounters: { enabled: boolean; intervalTurns: 1 | 2 | 3 | 6 }
    }
  } = {}
) => ({
  turnCounter: overrides.turnCounter ?? 0,
  actedCharacterIds: overrides.actedCharacterIds ?? [],
  reminderSettings: overrides.reminderSettings ?? {
    randomEncounters: { enabled: false as boolean, intervalTurns: 6 as const },
  },
})

const mapInstanceWith = (occupancy: Record<string, { zoneId: string }>) => ({
  geometry: { zones: {}, connections: {} },
  occupancy: Object.fromEntries(
    Object.entries(occupancy).map(([k, v]) => [
      k,
      { zoneId: v.zoneId, engagement: { status: "free" as const } },
    ])
  ),
  enchantment: null,
  reveal: reveal(),
})

describe("golden-master: connectionFogState (the three-state fog derivation)", () => {
  const cases = [
    {
      label: "both revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["a", "b"] }),
    },
    {
      label: "one revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["a"] }),
    },
    {
      label: "neither revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["x"] }),
    },
    {
      label: "hidden unsurfaced",
      c: conn("c", "a", "b", { hidden: true }),
      r: reveal({ revealedZoneIds: ["a"] }),
    },
    {
      label: "hidden surfaced",
      c: conn("c", "a", "b", { hidden: true }),
      r: reveal({ revealedZoneIds: ["a"], revealedConnectionIds: ["c"] }),
    },
  ]
  it.each(cases)("matches v1 for $label", ({ c, r }) => {
    expect(v2Fog(c, r)).toBe(v1Fog(c, r))
  })
})

describe("golden-master: fog predicates", () => {
  it("isFogActive matches v1", () => {
    expect(v2FogActive(reveal())).toBe(v1FogActive(reveal()))
    expect(v2FogActive(reveal({ revealedZoneIds: ["a"] }))).toBe(
      v1FogActive(reveal({ revealedZoneIds: ["a"] }))
    )
  })

  it("isZoneRevealed matches v1", () => {
    const r = reveal({ revealedZoneIds: ["a"] })
    expect(v2Revealed(r, "a")).toBe(v1Revealed(r, "a"))
    expect(v2Revealed(r, "b")).toBe(v1Revealed(r, "b"))
  })

  it("isConnectionLocked matches v1", () => {
    const c = conn("c", "a", "b", { locked: true })
    expect(v2Locked(c, reveal())).toBe(v1Locked(c, reveal()))
    expect(v2Locked(c, reveal({ unlockedConnectionIds: ["c"] }))).toBe(
      v1Locked(c, reveal({ unlockedConnectionIds: ["c"] }))
    )
  })
})

describe("golden-master: reduceDungeon (the turn loop)", () => {
  const events = [
    { kind: "markActed" as const, characterId: "c1" },
    { kind: "markActed" as const, characterId: "c1" }, // idempotent
    { kind: "markActed" as const, characterId: "c2" },
    { kind: "advanceTurn" as const },
  ]

  it("produces v1-identical state across a full event sequence", () => {
    let v1 = dungeonState({ turnCounter: 3 })
    let v2 = dungeonState({ turnCounter: 3 })
    for (const event of events) {
      v1 = v1Reduce(v1, event)
      v2 = v2Reduce(v2, event)
      expect(v2).toEqual(v1)
    }
  })
})

describe("golden-master: derived selectors", () => {
  it("deriveDungeonRoster matches v1", () => {
    const mapInstance = mapInstanceWith({
      c1: { zoneId: "z1" },
      c2: { zoneId: "z2" },
    })
    expect(v2Roster(mapInstance).sort()).toEqual(v1Roster(mapInstance).sort())
  })

  it("activeActedCharacterIds prunes stale ids like v1", () => {
    const state = dungeonState({ actedCharacterIds: ["c1", "gone"] })
    expect(v2ActiveActed(state, ["c1", "c2"])).toEqual(
      v1ActiveActed(state, ["c1", "c2"])
    )
  })

  it("dungeonReminders matches v1 across the day", () => {
    for (const turnCounter of [0, 6, 12, 49, 50, 52]) {
      const state = dungeonState({
        turnCounter,
        reminderSettings: {
          randomEncounters: { enabled: true, intervalTurns: 6 },
        },
      })
      expect(v2Reminders(state)).toEqual(v1Reminders(state))
    }
  })
})
