import { describe, expect, it } from "vitest"

import {
  emptyGenerationLedger,
  activeActedCharacterIds as v2ActiveActed,
  connectionFogState as v2Fog,
  isFogActive as v2FogActive,
  isConnectionLocked as v2Locked,
  reduceDungeon as v2Reduce,
  dungeonReminders as v2Reminders,
  isZoneRevealed as v2Revealed,
  deriveDungeonRoster as v2Roster,
} from "@workspace/game-v2/spatial"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"

/**
 * **Pinned golden master (UNN-529 → UNN-540).** The v1 spatial reducers + fog
 * derivations were the acceptance spec for their v2 re-homes (PRESERVE); until the
 * UNN-540 cutover this suite compared v2 against the live v1 oracle. The oracle was
 * deleted with the v1 spatial engine, so every expected value below is the **literal
 * observed on the final green oracle run** (2026-07-08, the same commit that deleted
 * v1) — the suite survives as a pinned-fixture regression over the frozen spec.
 * A failure means v2's behavior moved off the v1-parity baseline: treat it as an
 * incident, never `vitest -u`-style re-pinning.
 *
 * Scope is the behaviorally-identical surface: the dungeon turn loop, the derived
 * roster/reminder selectors, and the three-state connection fog derivation. The
 * player **snapshot** is intentionally *not* pinned — v2 deliberately SUPERSEDES its
 * shape (drops v1's second enemy-redaction path, CD12), so it is covered by its own
 * in-package security gate instead.
 */

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
  // Not part of the pinned v1-parity surface — the ledger (UNN-590) postdates
  // the oracle; the turn-loop reducers pass it through untouched.
  generation: emptyGenerationLedger(),
})

const mapInstanceWith = (occupancy: Record<string, { zoneId: string }>) => ({
  geometry: {
    pages: { default: { id: "default", name: "Page 1" } },
    zones: {},
    connections: {},
  },
  occupancy: Object.fromEntries(
    Object.entries(occupancy).map(([k, v]) => [
      k,
      { zoneId: v.zoneId, engagement: { status: "free" as const } },
    ])
  ),
  enchantment: null,
  reveal: reveal(),
  generation: makeGenerationState(),
  lastMovedTokenKey: null,
})

describe("golden-master: connectionFogState (the three-state fog derivation)", () => {
  const cases = [
    {
      label: "both revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["a", "b"] }),
      expected: "revealed",
    },
    {
      label: "one revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["a"] }),
      expected: "known-exit",
    },
    {
      label: "neither revealed",
      c: conn("c", "a", "b"),
      r: reveal({ revealedZoneIds: ["x"] }),
      expected: "stripped",
    },
    {
      label: "hidden unsurfaced",
      c: conn("c", "a", "b", { hidden: true }),
      r: reveal({ revealedZoneIds: ["a"] }),
      expected: "stripped",
    },
    {
      label: "hidden surfaced",
      c: conn("c", "a", "b", { hidden: true }),
      r: reveal({ revealedZoneIds: ["a"], revealedConnectionIds: ["c"] }),
      expected: "known-exit",
    },
  ] as const
  it.each(cases)("matches the v1 pin for $label", ({ c, r, expected }) => {
    expect(v2Fog(c, r)).toBe(expected)
  })
})

describe("golden-master: fog predicates", () => {
  it("isFogActive matches the v1 pin", () => {
    expect(v2FogActive(reveal())).toBe(false)
    expect(v2FogActive(reveal({ revealedZoneIds: ["a"] }))).toBe(true)
  })

  it("isZoneRevealed matches the v1 pin", () => {
    const r = reveal({ revealedZoneIds: ["a"] })
    expect(v2Revealed(r, "a")).toBe(true)
    expect(v2Revealed(r, "b")).toBe(false)
  })

  it("isConnectionLocked matches the v1 pin", () => {
    const c = conn("c", "a", "b", { locked: true })
    expect(v2Locked(c, reveal())).toBe(true)
    expect(v2Locked(c, reveal({ unlockedConnectionIds: ["c"] }))).toBe(false)
  })
})

describe("golden-master: reduceDungeon (the turn loop)", () => {
  const events = [
    { kind: "markActed" as const, characterId: "c1" },
    { kind: "markActed" as const, characterId: "c1" }, // idempotent
    { kind: "markActed" as const, characterId: "c2" },
    { kind: "advanceTurn" as const },
  ]

  it("produces the v1-pinned state at each step of a full event sequence", () => {
    const settings = {
      randomEncounters: { enabled: false, intervalTurns: 6 as const },
    }
    const expected = [
      {
        turnCounter: 3,
        actedCharacterIds: ["c1"],
        reminderSettings: settings,
        generation: emptyGenerationLedger(),
      },
      {
        turnCounter: 3,
        actedCharacterIds: ["c1"],
        reminderSettings: settings,
        generation: emptyGenerationLedger(),
      },
      {
        turnCounter: 3,
        actedCharacterIds: ["c1", "c2"],
        reminderSettings: settings,
        generation: emptyGenerationLedger(),
      },
      {
        turnCounter: 4,
        actedCharacterIds: [],
        reminderSettings: settings,
        generation: emptyGenerationLedger(),
      },
    ]

    let state = dungeonState({ turnCounter: 3 })
    events.forEach((event, index) => {
      state = v2Reduce(state, event)
      expect(state).toEqual(expected[index])
    })
  })
})

describe("golden-master: derived selectors", () => {
  it("deriveDungeonRoster matches the v1 pin", () => {
    const mapInstance = mapInstanceWith({
      c1: { zoneId: "z1" },
      c2: { zoneId: "z2" },
    })
    expect(v2Roster(mapInstance).sort()).toEqual(["c1", "c2"])
  })

  it("activeActedCharacterIds prunes stale ids like the v1 pin", () => {
    const state = dungeonState({ actedCharacterIds: ["c1", "gone"] })
    expect(v2ActiveActed(state, ["c1", "c2"])).toEqual(["c1"])
  })

  it("dungeonReminders matches the v1 pin across the day", () => {
    const expectedByTurn: Record<number, { kind: string; turn: number }[]> = {
      0: [],
      6: [{ kind: "random-encounter", turn: 6 }],
      12: [{ kind: "random-encounter", turn: 12 }],
      49: [{ kind: "exhaustion-onset", turn: 49 }],
      50: [],
      52: [{ kind: "exhaustion-onset", turn: 52 }],
    }
    for (const [turn, expected] of Object.entries(expectedByTurn)) {
      const state = dungeonState({
        turnCounter: Number(turn),
        reminderSettings: {
          randomEncounters: { enabled: true, intervalTurns: 6 },
        },
      })
      expect(v2Reminders(state)).toEqual(expected)
    }
  })
})
