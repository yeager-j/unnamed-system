import { describe, expect, it } from "vitest"

import { free, makeMapInstanceState } from "./__fixtures__/spatial"
import { createDungeonState, type DungeonState } from "./dungeon.schema"
import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  dungeonReminders,
  reduceDungeon,
} from "./reduce-dungeon"

const dungeon = (overrides: Partial<DungeonState> = {}): DungeonState => ({
  ...createDungeonState(),
  ...overrides,
})

describe("reduceDungeon (the exploration turn loop, SD11)", () => {
  describe("markActed", () => {
    it("records a character that has acted this turn", () => {
      const next = reduceDungeon(dungeon(), {
        kind: "markActed",
        characterId: "c1",
      })
      expect(next.actedCharacterIds).toEqual(["c1"])
    })

    it("is a same-ref no-op for an already-acted id (idempotent)", () => {
      const state = dungeon({ actedCharacterIds: ["c1"] })
      const next = reduceDungeon(state, {
        kind: "markActed",
        characterId: "c1",
      })
      expect(next).toBe(state)
    })
  })

  describe("advanceTurn", () => {
    it("increments the counter and clears the acted set", () => {
      const state = dungeon({ turnCounter: 4, actedCharacterIds: ["c1", "c2"] })
      const next = reduceDungeon(state, { kind: "advanceTurn" })
      expect(next.turnCounter).toBe(5)
      expect(next.actedCharacterIds).toEqual([])
    })
  })
})

describe("derived delve roster (not stored, SD11)", () => {
  it("deriveDungeonRoster reads the occupancy keys (characterIds)", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { c1: free("z1"), c2: free("z1") },
    })
    expect(deriveDungeonRoster(mapInstance).sort()).toEqual(["c1", "c2"])
  })

  it("activeActedCharacterIds prunes stale ids of departed characters at read-time", () => {
    const state = dungeon({ actedCharacterIds: ["c1", "departed"] })
    expect(activeActedCharacterIds(state, ["c1", "c2"])).toEqual(["c1"])
  })
})

describe("dungeonReminders (pure selectors over the turn counter)", () => {
  it("fires the random-encounter nudge at each interval multiple when enabled", () => {
    const state = dungeon({
      turnCounter: 6,
      reminderSettings: {
        randomEncounters: { enabled: true, intervalTurns: 6 },
      },
    })
    expect(dungeonReminders(state)).toContainEqual({
      kind: "random-encounter",
      turn: 6,
    })
  })

  it("never fires random-encounter on the un-started delve (turn 0)", () => {
    const state = dungeon({
      turnCounter: 0,
      reminderSettings: {
        randomEncounters: { enabled: true, intervalTurns: 6 },
      },
    })
    expect(dungeonReminders(state)).toEqual([])
  })

  it("fires exhaustion-onset from turn 49 on the 3-turn cadence, always-on", () => {
    expect(dungeonReminders(dungeon({ turnCounter: 49 }))).toContainEqual({
      kind: "exhaustion-onset",
      turn: 49,
    })
    expect(dungeonReminders(dungeon({ turnCounter: 52 }))).toContainEqual({
      kind: "exhaustion-onset",
      turn: 52,
    })
    expect(dungeonReminders(dungeon({ turnCounter: 50 }))).toEqual([])
  })
})

describe("reduceDungeon — draw ledger (UNN-590)", () => {
  const declaration = (
    id: string,
    overrides: Partial<DungeonState["generation"]["declarations"][number]> = {}
  ) => ({
    id,
    sequence: 0,
    templateKey: "vault",
    minDepth: 0,
    k: 6,
    secretIndex: 3,
    qualifyingCount: 0,
    ...overrides,
  })

  const withLedger = (
    generation: Partial<DungeonState["generation"]> = {}
  ): DungeonState =>
    dungeon({
      generation: {
        seed: "seed-1",
        streamCursors: { templates: 4 },
        declarations: [],
        mintedUniqueKeys: [],
        mints: {},
        ...generation,
      },
    })

  describe("declareSite", () => {
    it("appends the fully resolved declaration", () => {
      const next = reduceDungeon(withLedger(), {
        kind: "declareSite",
        declaration: declaration("d1"),
      })
      expect(next.generation.declarations).toEqual([declaration("d1")])
    })

    it("is a same-ref no-op on a duplicate declaration id (retry)", () => {
      const state = withLedger({ declarations: [declaration("d1")] })
      const next = reduceDungeon(state, {
        kind: "declareSite",
        declaration: declaration("d1", { k: 15 }),
      })
      expect(next).toBe(state)
    })
  })

  describe("recordMint", () => {
    const record = {
      sequence: 1,
      templateKey: "castle-entrance",
      unique: true,
      effects: [{ declarationId: "d1", incremented: true, resolved: true }],
    }

    it("writes the record, consumes uniqueness, and applies declaration effects", () => {
      const state = withLedger({ declarations: [declaration("d1")] })
      const next = reduceDungeon(state, {
        kind: "recordMint",
        zoneId: "zone-m",
        record,
      })
      expect(next.generation.mints["zone-m"]).toEqual(record)
      expect(next.generation.mintedUniqueKeys).toEqual(["castle-entrance"])
      expect(next.generation.declarations[0]).toMatchObject({
        qualifyingCount: 1,
        resolvedZoneId: "zone-m",
      })
    })

    it("is a same-ref no-op when the zone already has a mint record (retry)", () => {
      const state = withLedger({ mints: { "zone-m": record } })
      expect(
        reduceDungeon(state, { kind: "recordMint", zoneId: "zone-m", record })
      ).toBe(state)
    })

    it("skips effects naming a withdrawn declaration", () => {
      const state = withLedger()
      const next = reduceDungeon(state, {
        kind: "recordMint",
        zoneId: "zone-m",
        record,
      })
      expect(next.generation.mints["zone-m"]).toEqual(record)
      expect(next.generation.declarations).toEqual([])
    })

    it("does not double-add an already-minted unique key", () => {
      const state = withLedger({ mintedUniqueKeys: ["castle-entrance"] })
      const next = reduceDungeon(state, {
        kind: "recordMint",
        zoneId: "zone-m",
        record: { ...record, effects: [] },
      })
      expect(next.generation.mintedUniqueKeys).toEqual(["castle-entrance"])
    })
  })

  describe("revertMint", () => {
    const record = {
      sequence: 1,
      templateKey: "castle-entrance",
      unique: true,
      effects: [{ declarationId: "d1", incremented: true, resolved: true }],
    }

    it("replays the recorded inverse exactly (record → revert ≡ identity)", () => {
      const base = withLedger({ declarations: [declaration("d1")] })
      const minted = reduceDungeon(base, {
        kind: "recordMint",
        zoneId: "zone-m",
        record,
      })
      const reverted = reduceDungeon(minted, {
        kind: "revertMint",
        zoneId: "zone-m",
      })
      expect(reverted).toStrictEqual(base)
    })

    it("is a same-ref no-op on an absent record (benign retry)", () => {
      const state = withLedger()
      expect(
        reduceDungeon(state, { kind: "revertMint", zoneId: "zone-m" })
      ).toBe(state)
    })

    it("never touches streamCursors", () => {
      const minted = reduceDungeon(
        withLedger({ declarations: [declaration("d1")] }),
        {
          kind: "recordMint",
          zoneId: "zone-m",
          record,
        }
      )
      const reverted = reduceDungeon(minted, {
        kind: "revertMint",
        zoneId: "zone-m",
      })
      expect(reverted.generation.streamCursors).toEqual({ templates: 4 })
    })

    it("leaves a declaration resolved by a LATER mint untouched (non-LIFO soundness)", () => {
      // zone-m resolves d1; zone-n later re-resolves it is impossible (resolved
      // declarations don't re-draw) — the real non-LIFO case: d1 resolved by
      // zone-n, while zone-m's record only incremented. Reverting zone-m must
      // not clear d1's resolution.
      const base = withLedger({ declarations: [declaration("d1")] })
      const mintedM = reduceDungeon(base, {
        kind: "recordMint",
        zoneId: "zone-m",
        record: {
          sequence: 1,
          templateKey: "hall",
          unique: false,
          effects: [
            { declarationId: "d1", incremented: true, resolved: false },
          ],
        },
      })
      const mintedN = reduceDungeon(mintedM, {
        kind: "recordMint",
        zoneId: "zone-n",
        record: {
          sequence: 2,
          templateKey: "vault",
          unique: false,
          effects: [{ declarationId: "d1", incremented: true, resolved: true }],
        },
      })
      const reverted = reduceDungeon(mintedN, {
        kind: "revertMint",
        zoneId: "zone-m",
      })
      expect(reverted.generation.declarations[0]).toMatchObject({
        qualifyingCount: 1,
        resolvedZoneId: "zone-n",
      })
    })
  })

  describe("advanceCursors", () => {
    it("adds each consumed count, minting absent purposes at 0", () => {
      const next = reduceDungeon(withLedger(), {
        kind: "advanceCursors",
        consumed: { templates: 2, closure: 1 },
      })
      expect(next.generation.streamCursors).toEqual({
        templates: 6,
        closure: 1,
      })
    })
  })
})
