import { describe, expect, it } from "vitest"

import type {
  CharacterArchetypeRow,
  CharacterRow,
} from "@/lib/db/schema/character"

import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "../character/derive-hydrated-character"
import { LINEAGES, type Lineage } from "../character/lineage"
import {
  atlasNodeState,
  buildLineageAtlas,
  filterAtlasLineagesToUnlocked,
  getAtlasRecommendations,
  isAtlasNodeUnlocked,
  unmetPrerequisites,
  type AtlasLineage,
  type AtlasNode,
  type AtlasNodeState,
  type LineageAtlasView,
} from "./atlas"
import { ARCHETYPE_TIERS, type Archetype } from "./schema"

const CHARACTER_ID = "char-1"

function archetypeRow(
  partial: Pick<CharacterArchetypeRow, "id" | "archetypeKey" | "rank">
): CharacterArchetypeRow {
  return {
    characterId: CHARACTER_ID,
    inheritanceSlots: [],
    mechanicState: null,
    ...partial,
  }
}

function makeCharacter(options: {
  archetypeRows?: CharacterArchetypeRow[]
  savedArchetypeRanks?: number
  activeArchetypeId?: string | null
  originCharacterArchetypeId?: string | null
}) {
  const archetypeRows = options.archetypeRows ?? []
  const row: CharacterRow = {
    id: CHARACTER_ID,
    shortId: "char-1-short",
    ownerId: "user-1",
    campaignId: null,
    status: "finalized",
    builderStep: 0,
    name: "Test Character",
    pronouns: "they/them",
    portraitUrl: null,
    level: 1,
    pathChoice: "balanced",
    currentHP: 20,
    currentSP: 20,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    manualBonuses: {},
    virtueExpression: 0,
    virtueEmpathy: 0,
    virtueWisdom: 0,
    virtueFocus: 0,
    sparkLog: [],
    victories: 0,
    currency: 0,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: options.activeArchetypeId ?? null,
    originCharacterArchetypeId: options.originCharacterArchetypeId ?? null,
    savedArchetypeRanks: options.savedArchetypeRanks ?? 0,
    ancestryText: null,
    backgroundText: null,
    backstoryText: null,
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    gainedTalents: [],
    notes: null,
    identityVersion: 0,
    vitalsVersion: 0,
    inventoryVersion: 0,
    progressionVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }
  const raw: RawCharacterInputs = {
    row,
    archetypeRows,
    inventoryRows: [],
    knives: [],
    chains: [],
  }
  return deriveHydratedCharacter(raw)
}

/** A synthetic Adept that advances from Knight at Rank 5, for prerequisite
 *  logic that the shipped Initiate-only catalog can't exercise on its own. */
const syntheticAdept = {
  key: "synthetic-adept",
  name: "Synthetic Adept",
  lineage: "knight",
  tier: "adept",
  prerequisites: [{ archetype: "knight", rank: 5 }],
  inheritanceSlots: 3,
  talents: [],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 3, magic: -1, agility: 1, luck: 0 },
  affinities: {},
  skills: [],
} satisfies Archetype

describe("unmetPrerequisites", () => {
  it("is empty when the prerequisite Rank is met", () => {
    expect(
      unmetPrerequisites(syntheticAdept, new Map([["knight", 5]]))
    ).toEqual([])
  })

  it("returns the prerequisite when the owned Rank is too low", () => {
    expect(
      unmetPrerequisites(syntheticAdept, new Map([["knight", 4]]))
    ).toEqual([{ archetype: "knight", rank: 5 }])
  })

  it("returns the prerequisite when the parent Archetype is unowned", () => {
    expect(unmetPrerequisites(syntheticAdept, new Map())).toEqual([
      { archetype: "knight", rank: 5 },
    ])
  })
})

describe("atlasNodeState", () => {
  const noOwned = new Map<string, number>()

  it("is unlockable when unowned and all prerequisites are met", () => {
    expect(
      atlasNodeState(syntheticAdept, null, new Map([["knight", 5]]))
    ).toEqual({ kind: "unlockable" })
  })

  it("is locked with the unmet prerequisites when unowned and gated", () => {
    expect(atlasNodeState(syntheticAdept, null, noOwned)).toEqual({
      kind: "locked",
      unmetPrerequisites: [{ archetype: "knight", rank: 5 }],
    })
  })

  it("is owned below the Mastery Rank", () => {
    expect(atlasNodeState(syntheticAdept, 3, noOwned)).toEqual({
      kind: "owned",
      rank: 3,
    })
  })

  it("is mastered at the Mastery Rank", () => {
    expect(atlasNodeState(syntheticAdept, 5, noOwned)).toEqual({
      kind: "mastered",
      rank: 5,
    })
  })
})

describe("buildLineageAtlas", () => {
  it("lists all twelve Lineages in canonical order", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    expect(view.lineages.map((entry) => entry.lineage)).toEqual([...LINEAGES])
  })

  it("gives every Lineage all four tier columns in order", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    for (const entry of view.lineages) {
      expect(entry.columns.map((column) => column.tier)).toEqual([
        "initiate",
        "adept",
        "elite",
        "paragon",
      ])
    }
  })

  it("places a shipped Initiate in its Lineage's Initiate column as unlockable when unowned", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    const knight = view.lineages.find((entry) => entry.lineage === "knight")!
    expect(knight.progress).toEqual({ owned: 0, total: 1 })
    const initiateColumn = knight.columns.find(
      (column) => column.tier === "initiate"
    )!
    expect(initiateColumn.nodes).toHaveLength(1)
    expect(initiateColumn.nodes[0]!.archetype.key).toBe("knight")
    expect(initiateColumn.nodes[0]!.state).toEqual({ kind: "unlockable" })
  })

  it("marks an owned Archetype owned and bumps the Lineage progress", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "knight", rank: 2 }),
        ],
      })
    )
    const knight = view.lineages.find((entry) => entry.lineage === "knight")!
    expect(knight.progress).toEqual({ owned: 1, total: 1 })
    const node = knight.columns.find((column) => column.tier === "initiate")!
      .nodes[0]!
    expect(node.state).toEqual({ kind: "owned", rank: 2 })
    expect(node.characterArchetypeId).toBe("a1")
  })

  it("marks a Rank-5 Archetype mastered", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "mage", rank: 5 }),
        ],
      })
    )
    const node = view.lineages
      .find((entry) => entry.lineage === "mage")!
      .columns.find((column) => column.tier === "initiate")!.nodes[0]!
    expect(node.state).toEqual({ kind: "mastered", rank: 5 })
  })

  it("passes through Saved Ranks, unlocked count, and Origin Lineage", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 3 }),
          archetypeRow({ id: "a2", archetypeKey: "healer", rank: 1 }),
        ],
        savedArchetypeRanks: 4,
        originCharacterArchetypeId: "a1",
      })
    )
    expect(view.savedRanks).toBe(4)
    expect(view.unlockedCount).toBe(2)
    expect(view.originLineage).toBe("warrior")

    const warrior = view.lineages.find((entry) => entry.lineage === "warrior")!
    expect(warrior.isOrigin).toBe(true)
    for (const entry of view.lineages) {
      if (entry.lineage !== "warrior") expect(entry.isOrigin).toBeFalsy()
    }
  })

  it("carries an Archetype's prerequisite keys as its parent links", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    const knightNode = view.lineages
      .find((entry) => entry.lineage === "knight")!
      .columns.find((column) => column.tier === "initiate")!.nodes[0]!
    expect(knightNode.parentKeys).toEqual([])
  })
})

describe("isAtlasNodeUnlocked", () => {
  const states: { state: AtlasNodeState; unlocked: boolean }[] = [
    { state: { kind: "owned", rank: 1 }, unlocked: true },
    { state: { kind: "mastered", rank: 5 }, unlocked: true },
    { state: { kind: "unlockable" }, unlocked: false },
    { state: { kind: "locked", unmetPrerequisites: [] }, unlocked: false },
  ]
  for (const { state, unlocked } of states) {
    it(`treats ${state.kind} as ${unlocked ? "" : "not "}unlocked`, () => {
      expect(isAtlasNodeUnlocked({ state } as AtlasNode)).toBe(unlocked)
    })
  }
})

describe("filterAtlasLineagesToUnlocked", () => {
  it("keeps only owned/mastered nodes and drops Lineages with none", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 3 }),
          archetypeRow({ id: "a2", archetypeKey: "mage", rank: 5 }),
        ],
      })
    )
    const filtered = filterAtlasLineagesToUnlocked(view.lineages)

    expect(filtered.map((entry) => entry.lineage)).toEqual(["warrior", "mage"])
    for (const entry of filtered) {
      const nodes = entry.columns.flatMap((column) => column.nodes)
      expect(nodes.every(isAtlasNodeUnlocked)).toBe(true)
      expect(nodes.length).toBeGreaterThan(0)
    }
  })

  it("leaves progress counts untouched on a surviving Lineage", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 3 }),
        ],
      })
    )
    const warrior = filterAtlasLineagesToUnlocked(view.lineages).find(
      (entry) => entry.lineage === "warrior"
    )!
    expect(warrior.progress).toEqual({ owned: 1, total: 1 })
  })

  it("returns nothing when no Archetype is unlocked", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    expect(filterAtlasLineagesToUnlocked(view.lineages)).toEqual([])
  })
})

/**
 * Hand-built Atlas views let the recommendation tests exercise every node state
 * — including `locked` and `mastered`, which the shipped Initiate-only catalog
 * can't produce on its own — and reach the full three-slot fill the small
 * catalog otherwise can't.
 */
function makeArchetype(
  archetype: Pick<Archetype, "key" | "lineage" | "tier"> & Partial<Archetype>
): Archetype {
  return {
    name: archetype.key,
    prerequisites: [],
    inheritanceSlots: 3,
    talents: [],
    mastery: { kind: "hp", amount: 10 },
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    skills: [],
    ...archetype,
  }
}

function node(
  state: AtlasNodeState,
  archetype: Pick<Archetype, "key" | "lineage" | "tier"> & Partial<Archetype>,
  characterArchetypeId: string | null = null
): AtlasNode {
  return {
    archetype: makeArchetype(archetype),
    state,
    characterArchetypeId,
    parentKeys: [],
  }
}

function lineageEntry(
  lineage: Lineage,
  nodes: AtlasNode[],
  ownedOverride?: number
): AtlasLineage {
  return {
    lineage,
    progress: {
      owned:
        ownedOverride ??
        nodes.filter((entry) => entry.characterArchetypeId !== null).length,
      total: nodes.length,
    },
    columns: ARCHETYPE_TIERS.map((tier) => ({
      tier,
      nodes: nodes.filter((entry) => entry.archetype.tier === tier),
    })),
  }
}

function makeView(options: {
  lineages: AtlasLineage[]
  savedRanks?: number
  originLineage?: Lineage | null
}): LineageAtlasView {
  return {
    lineages: options.lineages,
    savedRanks: options.savedRanks ?? 5,
    unlockedCount: 0,
    originLineage: options.originLineage ?? null,
  }
}

const keysOf = (recommendations: AtlasNode["archetype"][]) =>
  recommendations.map((archetype) => archetype.key)

describe("getAtlasRecommendations", () => {
  it("fills Slot 1 from the Origin Lineage and badges it", () => {
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "owned", rank: 3 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
        ]),
        lineageEntry("knight", [
          node(
            { kind: "unlockable" },
            {
              key: "knight",
              lineage: "knight",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    const result = getAtlasRecommendations(view, "health-focused", 5)

    expect(result[0]!.archetype.key).toBe("warrior")
    expect(result[0]!.reason).toBe("origin-lineage")
    expect(result[0]!.state).toEqual({ kind: "owned", rank: 3 })
  })

  it("prefers the lower-tier Origin step (Initiate before its branch)", () => {
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "owned", rank: 3 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
          node(
            { kind: "unlockable" },
            {
              key: "warrior-adept",
              lineage: "warrior",
              tier: "adept",
            }
          ),
        ]),
      ],
    })

    const result = getAtlasRecommendations(view, "balanced", 5)

    expect(result[0]!.archetype.key).toBe("warrior")
  })

  it("falls back to a Path-fit pick for Slot 1 when the Origin Lineage is exhausted", () => {
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "mastered", rank: 5 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
        ]),
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    const result = getAtlasRecommendations(view, "skill-focused", 5)

    expect(result[0]!.archetype.key).toBe("mage")
    expect(result[0]!.reason).toBe("fits-path")
  })

  it("surfaces only Path-matching Lineages among untouched ones", () => {
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            }
          ),
        ]),
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
            }
          ),
        ]),
        lineageEntry("healer", [
          node(
            { kind: "unlockable" },
            {
              key: "healer",
              lineage: "healer",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    expect(
      keysOf(
        getAtlasRecommendations(view, "skill-focused", 5).map(
          (r) => r.archetype
        )
      )
    ).toEqual(["mage"])
    expect(
      keysOf(
        getAtlasRecommendations(view, "health-focused", 5).map(
          (r) => r.archetype
        )
      )
    ).toEqual(["warrior"])
    expect(
      keysOf(
        getAtlasRecommendations(view, "balanced", 5).map((r) => r.archetype)
      )
    ).toEqual(["healer"])
  })

  it("recommends an off-Path Lineage the character has invested a Rank in", () => {
    // Balanced character who has put Ranks into Knight (a health-Path Lineage):
    // continuing that investment should beat opening an untouched on-Path Lineage.
    const view = makeView({
      lineages: [
        lineageEntry("knight", [
          node(
            { kind: "owned", rank: 3 },
            { key: "knight", lineage: "knight", tier: "initiate" },
            "a1"
          ),
          node(
            { kind: "unlockable" },
            { key: "knight-adept", lineage: "knight", tier: "adept" }
          ),
        ]),
        lineageEntry("healer", [
          node(
            { kind: "unlockable" },
            { key: "healer", lineage: "healer", tier: "initiate" }
          ),
        ]),
      ],
    })

    const result = getAtlasRecommendations(view, "balanced", 5)

    expect(result.map((r) => r.archetype.key)).toEqual([
      "knight",
      "knight-adept",
      "healer",
    ])
    expect(result.map((r) => r.reason)).toEqual([
      "unlocked-archetype",
      "unlocked-archetype",
      "fits-path",
    ])
  })

  it("does not surface an untouched off-Path Lineage", () => {
    // Balanced character, Knight (health-Path) untouched and no progress anywhere.
    const view = makeView({
      lineages: [
        lineageEntry("knight", [
          node(
            { kind: "unlockable" },
            { key: "knight", lineage: "knight", tier: "initiate" }
          ),
        ]),
      ],
    })

    expect(getAtlasRecommendations(view, "balanced", 5)).toEqual([])
  })

  it("never repeats the Slot 1 Archetype across the three slots", () => {
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "owned", rank: 2 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
          node(
            { kind: "unlockable" },
            {
              key: "warrior-adept",
              lineage: "warrior",
              tier: "adept",
            }
          ),
        ]),
        lineageEntry("knight", [
          node(
            { kind: "unlockable" },
            {
              key: "knight",
              lineage: "knight",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    const keys = getAtlasRecommendations(view, "health-focused", 5).map(
      (r) => r.archetype.key
    )

    expect(keys).toHaveLength(3)
    expect(new Set(keys).size).toBe(3)
    expect(keys).toContain("warrior")
  })

  it("nudges toward Lineages already in progress before untouched ones", () => {
    const view = makeView({
      lineages: [
        lineageEntry(
          "warrior",
          [
            node(
              { kind: "unlockable" },
              {
                key: "warrior-adept",
                lineage: "warrior",
                tier: "adept",
              }
            ),
          ],
          1
        ),
        lineageEntry("knight", [
          node(
            { kind: "unlockable" },
            {
              key: "knight",
              lineage: "knight",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    const keys = getAtlasRecommendations(view, "health-focused", 5).map(
      (r) => r.archetype.key
    )

    expect(keys).toEqual(["warrior-adept", "knight"])
  })

  it("never recommends a locked or mastered Archetype", () => {
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            {
              kind: "locked",
              unmetPrerequisites: [{ archetype: "x", rank: 5 }],
            },
            { key: "warrior-adept", lineage: "warrior", tier: "adept" }
          ),
          node(
            { kind: "mastered", rank: 5 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
        ]),
        lineageEntry("knight", [
          node(
            { kind: "unlockable" },
            {
              key: "knight",
              lineage: "knight",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    const keys = getAtlasRecommendations(view, "health-focused", 5).map(
      (r) => r.archetype.key
    )

    expect(keys).toEqual(["knight"])
  })

  it("returns fewer than three when fewer are eligible", () => {
    const view = makeView({
      lineages: [
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    expect(getAtlasRecommendations(view, "skill-focused", 5)).toHaveLength(1)
  })

  it("returns an empty list when nothing is actionable", () => {
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            {
              kind: "locked",
              unmetPrerequisites: [{ archetype: "x", rank: 5 }],
            },
            { key: "warrior-adept", lineage: "warrior", tier: "adept" }
          ),
        ]),
      ],
    })

    expect(getAtlasRecommendations(view, "health-focused", 5)).toEqual([])
  })

  it("still recommends with no Saved Ranks below the level ceiling (planning)", () => {
    const view = makeView({
      savedRanks: 0,
      lineages: [
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
            }
          ),
        ]),
      ],
    })

    expect(getAtlasRecommendations(view, "skill-focused", 1)).toHaveLength(1)
  })

  it("returns nothing at the level ceiling with no Saved Ranks", () => {
    const candidate = lineageEntry("mage", [
      node(
        { kind: "unlockable" },
        {
          key: "mage",
          lineage: "mage",
          tier: "initiate",
        }
      ),
    ])

    expect(
      getAtlasRecommendations(
        makeView({ savedRanks: 0, lineages: [candidate] }),
        "skill-focused",
        30
      )
    ).toEqual([])
    expect(
      getAtlasRecommendations(
        makeView({ savedRanks: 2, lineages: [candidate] }),
        "skill-focused",
        30
      )
    ).toHaveLength(1)
  })

  it("returns an empty list when every Archetype is Mastered", () => {
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "mastered", rank: 5 },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
            },
            "a1"
          ),
        ]),
        lineageEntry("mage", [
          node(
            { kind: "mastered", rank: 5 },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
            },
            "a2"
          ),
        ]),
      ],
    })

    expect(getAtlasRecommendations(view, "skill-focused", 5)).toEqual([])
  })

  it("composes with the real view builder over the shipped catalog", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 2 }),
        ],
        originCharacterArchetypeId: "a1",
      })
    )

    const result = getAtlasRecommendations(view, "health-focused", 1)

    expect(result[0]!.archetype.key).toBe("warrior")
    expect(result[0]!.reason).toBe("origin-lineage")
    expect(result.map((r) => r.archetype.key)).toContain("knight")
    expect(new Set(result.map((r) => r.archetype.key)).size).toBe(result.length)
  })
})
