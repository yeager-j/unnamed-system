import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  atlasNodeState,
  buildLineageAtlas,
  filterAtlasLineagesToUnlocked,
  isAtlasNodeUnlocked,
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
