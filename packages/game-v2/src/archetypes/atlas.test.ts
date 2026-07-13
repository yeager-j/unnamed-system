import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  archetypeTierLevel,
  atlasNodeState,
  buildLineageAtlas,
  filterAtlasLineagesToUnlocked,
  isAtlasNodeUnlocked,
  isNarrativelyLocked,
  unmetPrerequisites,
  type AtlasNode,
} from "@workspace/game-v2/archetypes/atlas"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

function archetype(overrides: Partial<Archetype> & { key: string }): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "hp", amount: 0 },
    lineage: "warrior",
    name: overrides.key,
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    skills: [],
    ...overrides,
  }
}

// A multi-tier warrior lineage (with a prerequisite chain) + a one-initiate mage.
const warrior = archetype({
  key: "warrior",
  lineage: "warrior",
  tier: "initiate",
})
const warlord = archetype({
  key: "warlord",
  lineage: "warrior",
  tier: "adept",
  prerequisites: [{ archetype: "warrior", rank: 5 }],
})
const battlemage = archetype({
  key: "battlemage",
  lineage: "warrior",
  tier: "adept",
  prerequisites: [{ archetype: "warrior", rank: 3 }],
})
const mage = archetype({ key: "mage", lineage: "mage", tier: "initiate" })

const CATALOG = [warlord, warrior, battlemage, mage] // unsorted on purpose
const allArchetypes = () => CATALOG

function resolved(
  archetypes:
    | {
        active?: string | null
        origin?: string | null
        savedArchetypeRanks?: number
        roster?: Array<{ key: string; rank: number }>
      }
    | undefined
): ResolvedEntity {
  if (!archetypes) return { id: "e", components: {} }
  return {
    id: "pc",
    components: {
      archetypes: {
        active: archetypes.active ?? null,
        origin: archetypes.origin ?? null,
        savedArchetypeRanks: archetypes.savedArchetypeRanks ?? 0,
        activeLineage: null,
        roster: (archetypes.roster ?? []).map((r) => ({
          key: r.key,
          rank: r.rank,
          mastered: r.rank >= 5,
          inheritanceSlots: [],
        })),
      },
    },
  }
}

describe("unmetPrerequisites (A10 — >= boundary, declaration order)", () => {
  const owned = new Map([["warrior", 3]])
  it("returns prereqs whose owned rank is too low (or unowned ⇒ 0)", () => {
    expect(unmetPrerequisites(warlord, owned)).toEqual([
      { archetype: "warrior", rank: 5 },
    ])
  })
  it("returns [] when every prereq is met at exactly the required rank", () => {
    expect(unmetPrerequisites(battlemage, owned)).toEqual([])
  })
})

describe("atlasNodeState (A11 — owned wins over the prereq check; mastery at >= 5)", () => {
  const empty = new Map<string, number>()
  it("owned below mastery", () => {
    expect(atlasNodeState(warrior, 3, empty)).toEqual({
      kind: "owned",
      rank: 3,
    })
  })
  it("mastered at rank 5", () => {
    expect(atlasNodeState(warrior, 5, empty)).toEqual({
      kind: "mastered",
      rank: 5,
    })
  })
  it("unowned + unmet prereqs ⇒ locked", () => {
    expect(atlasNodeState(warlord, null, empty)).toEqual({
      kind: "locked",
      unmetPrerequisites: [{ archetype: "warrior", rank: 5 }],
    })
  })
  it("unowned + all prereqs met ⇒ unlockable", () => {
    expect(atlasNodeState(warlord, null, new Map([["warrior", 5]]))).toEqual({
      kind: "unlockable",
    })
  })
  it("owned wins even when prereqs are no longer met", () => {
    expect(atlasNodeState(warlord, 2, empty)).toEqual({
      kind: "owned",
      rank: 2,
    })
  })
})

describe("buildLineageAtlas (A1–A9)", () => {
  const build = buildLineageAtlas({ allArchetypes })

  it("lists all twelve Lineages in canonical order, each with four tier columns", () => {
    const view = build(resolved(undefined))
    expect(view.lineages).toHaveLength(12)
    expect(view.lineages[0]!.lineage).toBe("warrior")
    expect(view.lineages.map((l) => l.columns.map((c) => c.tier))).toEqual(
      Array.from({ length: 12 }, () => [
        "initiate",
        "adept",
        "elite",
        "paragon",
      ])
    )
  })

  it("buckets same-tier Archetypes by tier column, key-sorted within (A2/A3)", () => {
    const warriorLineage = build(resolved(undefined)).lineages[0]!
    const adept = warriorLineage.columns.find((c) => c.tier === "adept")!
    // battlemage before warlord (localeCompare on key), both adept
    expect(adept.nodes.map((n) => n.archetype.key)).toEqual([
      "battlemage",
      "warlord",
    ])
    expect(
      warriorLineage.columns.find((c) => c.tier === "elite")!.nodes
    ).toHaveLength(0)
  })

  it("stamps owned/mastered state, ownedKey, and Lineage progress (A5)", () => {
    const view = build(resolved({ roster: [{ key: "warrior", rank: 5 }] }))
    const initiate = view.lineages[0]!.columns.find(
      (c) => c.tier === "initiate"
    )!
    const node = initiate.nodes.find((n) => n.archetype.key === "warrior")!
    expect(node.state).toEqual({ kind: "mastered", rank: 5 })
    expect(node.ownedKey).toBe("warrior")
    expect(view.lineages[0]!.progress).toEqual({ owned: 1, total: 3 })
    expect(view.unlockedCount).toBe(1)
  })

  it("carries parentKeys from prerequisites (A7)", () => {
    const adept = build(resolved(undefined)).lineages[0]!.columns.find(
      (c) => c.tier === "adept"
    )!
    expect(
      adept.nodes.find((n) => n.archetype.key === "warlord")!.parentKeys
    ).toEqual(["warrior"])
  })

  it("ignores an owned key not in the catalog (A6 drift)", () => {
    const view = build(resolved({ roster: [{ key: "ghost", rank: 4 }] }))
    expect(view.unlockedCount).toBe(0)
  })

  it("hiddenArchetypeKeys drops nodes before shaping (A4)", () => {
    const view = build(resolved(undefined), {
      hiddenArchetypeKeys: ["warlord"],
    })
    const adept = view.lineages[0]!.columns.find((c) => c.tier === "adept")!
    expect(adept.nodes.map((n) => n.archetype.key)).toEqual(["battlemage"])
  })

  it("resolves originLineage from the origin key, stamping isOrigin (A8)", () => {
    const view = build(resolved({ origin: "mage" }))
    expect(view.originLineage).toBe("mage")
    expect(view.lineages.find((l) => l.lineage === "mage")!.isOrigin).toBe(true)
    expect(view.lineages.find((l) => l.lineage === "warrior")!.isOrigin).toBe(
      false
    )
  })

  it("originLineage is null when the origin key is unknown/hidden", () => {
    expect(build(resolved({ origin: "ghost" })).originLineage).toBeNull()
    expect(
      build(resolved({ origin: "warrior" }), {
        hiddenArchetypeKeys: ["warrior"],
      }).originLineage
    ).toBeNull()
  })

  it("passes savedRanks through", () => {
    expect(build(resolved({ savedArchetypeRanks: 4 })).savedRanks).toBe(4)
  })
})

describe("narrativeGate (D8 — narrative-locked, origin floor, union lanes)", () => {
  const build = buildLineageAtlas({ allArchetypes })

  function statesByKey(view: ReturnType<typeof build>): Map<string, string> {
    return new Map(
      view.lineages
        .flatMap((l) => l.columns)
        .flatMap((c) => c.nodes)
        .map((n) => [n.archetype.key, n.state.kind])
    )
  }

  it("archetypeTierLevel maps the four tiers to 1..4", () => {
    expect(
      (["initiate", "adept", "elite", "paragon"] as const).map(
        archetypeTierLevel
      )
    ).toEqual([1, 2, 3, 4])
  })

  it("isNarrativelyLocked: undefined gate locks nothing", () => {
    expect(isNarrativelyLocked(warlord, undefined, null)).toBe(false)
  })

  it("isNarrativelyLocked: absent entry is fully locked unless origin (Initiate floor)", () => {
    const gate = new Map()
    expect(isNarrativelyLocked(warrior, gate, null)).toBe(true)
    expect(isNarrativelyLocked(warrior, gate, "warrior")).toBe(false)
    expect(isNarrativelyLocked(warlord, gate, "warrior")).toBe(true)
  })

  it("undefined gate leaves the view byte-identical", () => {
    const seed = resolved({
      origin: "warrior",
      roster: [{ key: "warrior", rank: 3 }],
    })
    expect(build(seed, {})).toStrictEqual(build(seed))
  })

  it("empty gate: origin keeps its Initiate tier, everything else narrative-locks", () => {
    const view = build(resolved({ origin: "warrior" }), {
      narrativeGate: new Map(),
    })
    const states = statesByKey(view)
    expect(states.get("warrior")).toBe("unlockable")
    expect(states.get("warlord")).toBe("narrative-locked")
    expect(states.get("battlemage")).toBe("narrative-locked")
    expect(states.get("mage")).toBe("narrative-locked")
  })

  it("origin lane opens tiers up to the gate value; above stays locked", () => {
    const view = build(resolved({ origin: "warrior" }), {
      narrativeGate: new Map([["warrior", 2]]),
    })
    const states = statesByKey(view)
    expect(states.get("warrior")).toBe("unlockable")
    expect(states.get("warlord")).toBe("locked")
    expect(states.get("battlemage")).toBe("locked")
  })

  it("bond lane has no floor for a non-origin Lineage", () => {
    const view = build(resolved({ origin: "warrior" }), {
      narrativeGate: new Map([["mage", 1]]),
    })
    expect(statesByKey(view).get("mage")).toBe("unlockable")
    const withoutBond = build(resolved({ origin: "warrior" }), {
      narrativeGate: new Map(),
    })
    expect(statesByKey(withoutBond).get("mage")).toBe("narrative-locked")
  })

  it("owned/mastered win over the gate (regress never re-locks holdings)", () => {
    const view = build(
      resolved({
        roster: [
          { key: "warrior", rank: 5 },
          { key: "warlord", rank: 2 },
        ],
      }),
      { narrativeGate: new Map() }
    )
    const states = statesByKey(view)
    expect(states.get("warrior")).toBe("mastered")
    expect(states.get("warlord")).toBe("owned")
    expect(view.lineages[0]!.progress).toEqual({ owned: 2, total: 3 })
  })

  it("narrative-locked replaces prereq-locked (no unmetPrerequisites payload)", () => {
    const view = build(resolved(undefined), { narrativeGate: new Map() })
    const warlordNode = view.lineages[0]!.columns.flatMap((c) => c.nodes).find(
      (n) => n.archetype.key === "warlord"
    )!
    expect(warlordNode.state).toEqual({ kind: "narrative-locked" })
  })
})

describe("isAtlasNodeUnlocked / filterAtlasLineagesToUnlocked (A12/A13)", () => {
  const build = buildLineageAtlas({ allArchetypes })

  it("isAtlasNodeUnlocked is true for owned/mastered only", () => {
    const owned: AtlasNode = {
      archetype: warrior,
      state: { kind: "owned", rank: 2 },
      ownedKey: "warrior",
      parentKeys: [],
    }
    const lockable: AtlasNode = {
      ...owned,
      state: { kind: "unlockable" },
      ownedKey: null,
    }
    expect(isAtlasNodeUnlocked(owned)).toBe(true)
    expect(isAtlasNodeUnlocked(lockable)).toBe(false)
  })

  it("keeps only unlocked nodes and drops empty Lineages, leaving progress intact", () => {
    const view = build(resolved({ roster: [{ key: "warrior", rank: 2 }] }))
    const filtered = filterAtlasLineagesToUnlocked(view.lineages)
    expect(filtered.map((l) => l.lineage)).toEqual(["warrior"])
    expect(filtered[0]!.progress).toEqual({ owned: 1, total: 3 }) // untouched
    expect(
      filtered[0]!.columns.flatMap((c) => c.nodes).map((n) => n.archetype.key)
    ).toEqual(["warrior"])
  })
})
