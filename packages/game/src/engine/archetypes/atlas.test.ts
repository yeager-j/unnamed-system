import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { makeAttackSkill } from "@workspace/game/engine/__fixtures__/skills"
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
} from "@workspace/game/engine/archetypes/atlas"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import { type GameData } from "@workspace/game/engine/ports"
import {
  ARCHETYPE_TIERS,
  type Archetype,
} from "@workspace/game/foundation/archetypes/schema"
import {
  LINEAGES,
  type Lineage,
} from "@workspace/game/foundation/character/lineage"
import type {
  CharacterArchetypeRow,
  CharacterRow,
} from "@workspace/game/foundation/character/records"

const CHARACTER_ID = "char-1"

/** A synthetic one-Initiate-per-Lineage catalog standing in for the shipped set:
 *  the slice's row/state/origin logic only needs keys + lineages + tiers to
 *  resolve, never balance numbers, so behavior tests stay decoupled from the
 *  roster. The multi-tier/prerequisite blocks inject their own richer catalogs. */
const FIXTURE_CATALOG = [
  makeArchetype({ key: "warrior", lineage: "warrior", tier: "initiate" }),
  makeArchetype({ key: "knight", lineage: "knight", tier: "initiate" }),
  makeArchetype({ key: "healer", lineage: "healer", tier: "initiate" }),
  makeArchetype({ key: "mage", lineage: "mage", tier: "initiate" }),
]
const TEST_DATA = makeTestGameData({ archetypes: FIXTURE_CATALOG })

/** Binds the catalog: defaults to {@link FIXTURE_CATALOG}, or takes an injected
 *  fixture catalog for the multi-tier prerequisite cases. */
const atlasOf = (
  character: Parameters<ReturnType<typeof buildLineageAtlas>>[0],
  catalog: readonly Archetype[] = FIXTURE_CATALOG
) => buildLineageAtlas({ allArchetypes: () => catalog })(character)

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

function makeCharacter(
  options: {
    archetypeRows?: CharacterArchetypeRow[]
    savedArchetypeRanks?: number
    activeArchetypeId?: string | null
    originCharacterArchetypeId?: string | null
  },
  data: GameData = TEST_DATA
) {
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
  return deriveHydratedCharacter(data)(raw)
}

/** A synthetic Adept that advances from Knight at Rank 5, for prerequisite
 *  logic that the shipped Initiate-only catalog can't exercise on its own. */
const syntheticAdept = makeArchetype({
  key: "synthetic-adept",
  lineage: "knight",
  tier: "adept",
  prerequisites: [{ archetype: "knight", rank: 5 }],
})

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
    const view = atlasOf(makeCharacter({}))
    expect(view.lineages.map((entry) => entry.lineage)).toEqual([...LINEAGES])
  })

  it("gives every Lineage all four tier columns in order", () => {
    const view = atlasOf(makeCharacter({}))
    for (const entry of view.lineages) {
      expect(entry.columns.map((column) => column.tier)).toEqual([
        "initiate",
        "adept",
        "elite",
        "paragon",
      ])
    }
  })

  it("places a catalog Initiate in its Lineage's Initiate column as unlockable when unowned", () => {
    const view = atlasOf(makeCharacter({}))
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
    const view = atlasOf(
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
    const view = atlasOf(
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
    const view = atlasOf(
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

  it("ignores an owned row whose Archetype key is not in the catalog", () => {
    const view = atlasOf(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 2 }),
          archetypeRow({
            id: "a2",
            archetypeKey: "not-a-real-archetype",
            rank: 4,
          }),
        ],
      })
    )
    expect(view.unlockedCount).toBe(1)
    const warrior = view.lineages.find((entry) => entry.lineage === "warrior")!
    expect(warrior.progress).toEqual({ owned: 1, total: 1 })
  })

  it("leaves Origin Lineage null when the Origin row points at an unknown Archetype", () => {
    const view = atlasOf(
      makeCharacter({
        archetypeRows: [
          archetypeRow({
            id: "a1",
            archetypeKey: "not-a-real-archetype",
            rank: 2,
          }),
        ],
        originCharacterArchetypeId: "a1",
      })
    )
    expect(view.originLineage).toBeNull()
    for (const entry of view.lineages) expect(entry.isOrigin).toBeFalsy()
  })

  it("leaves Origin Lineage null when no Origin row is set", () => {
    const view = atlasOf(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 2 }),
        ],
        originCharacterArchetypeId: null,
      })
    )
    expect(view.originLineage).toBeNull()
  })

  it("resolves Origin Lineage from the matching Origin row, not just any owned row", () => {
    const view = atlasOf(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 2 }),
          archetypeRow({ id: "a2", archetypeKey: "mage", rank: 1 }),
        ],
        originCharacterArchetypeId: "a2",
      })
    )
    expect(view.originLineage).toBe("mage")
    expect(
      view.lineages.find((entry) => entry.lineage === "mage")!.isOrigin
    ).toBe(true)
    expect(
      view.lineages.find((entry) => entry.lineage === "warrior")!.isOrigin
    ).toBeFalsy()
  })

  it("carries an Archetype's prerequisite keys as its parent links", () => {
    const view = atlasOf(makeCharacter({}))
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
    const view = atlasOf(
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
    const view = atlasOf(
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
    const view = atlasOf(makeCharacter({}))
    expect(filterAtlasLineagesToUnlocked(view.lineages)).toEqual([])
  })
})

// Inject a fixture catalog so buildLineageAtlas exercises the multi-tier
// sort and prerequisite resolution the shipped one-per-Lineage/no-prereq
// catalog can't reach. (Only the demo catalog has these in the running app.)
describe("buildLineageAtlas — injected multi-Archetype catalog", () => {
  const fxInitiate = makeArchetype({
    key: "fx-initiate",
    lineage: "warrior",
    tier: "initiate",
  })
  const fxAdeptA = makeArchetype({
    key: "fx-adept-a",
    lineage: "warrior",
    tier: "adept",
    prerequisites: [{ archetype: "fx-initiate", rank: 5 }],
  })
  const fxAdeptB = makeArchetype({
    key: "fx-adept-b",
    lineage: "warrior",
    tier: "adept",
  })
  // Deliberately out of key/tier order so the within-tier sort must reorder.
  const CATALOG = [fxAdeptB, fxAdeptA, fxInitiate]

  const warriorColumns = (view: LineageAtlasView) =>
    view.lineages.find((l) => l.lineage === "warrior")!.columns
  const nodeFor = (view: LineageAtlasView, key: string) =>
    view.lineages
      .flatMap((l) => l.columns)
      .flatMap((c) => c.nodes)
      .find((n) => n.archetype.key === key)!

  it("orders same-tier Archetypes within a column by key", () => {
    const adept = warriorColumns(atlasOf(makeCharacter({}), CATALOG)).find(
      (c) => c.tier === "adept"
    )!
    expect(adept.nodes.map((n) => n.archetype.key)).toEqual([
      "fx-adept-a",
      "fx-adept-b",
    ])
  })

  it("groups Archetypes into their tier columns", () => {
    const columns = warriorColumns(atlasOf(makeCharacter({}), CATALOG))
    expect(
      columns
        .find((c) => c.tier === "initiate")!
        .nodes.map((n) => n.archetype.key)
    ).toEqual(["fx-initiate"])
    expect(columns.find((c) => c.tier === "adept")!.nodes).toHaveLength(2)
    expect(columns.find((c) => c.tier === "elite")!.nodes).toEqual([])
  })

  it("leaves a Lineage with no catalog Archetypes empty", () => {
    const mage = atlasOf(makeCharacter({}), CATALOG).lineages.find(
      (l) => l.lineage === "mage"
    )!
    expect(mage.columns.every((c) => c.nodes.length === 0)).toBe(true)
  })

  it("locks an Archetype with an unmet prerequisite, listing it + parent keys", () => {
    const adeptA = nodeFor(atlasOf(makeCharacter({}), CATALOG), "fx-adept-a")
    expect(adeptA.state).toEqual({
      kind: "locked",
      unmetPrerequisites: [{ archetype: "fx-initiate", rank: 5 }],
    })
    expect(adeptA.parentKeys).toEqual(["fx-initiate"])
  })

  it("unlocks it once the prerequisite Archetype is owned at the required rank", () => {
    const character = makeCharacter({
      archetypeRows: [
        archetypeRow({ id: "r1", archetypeKey: "fx-initiate", rank: 5 }),
      ],
    })
    expect(nodeFor(atlasOf(character, CATALOG), "fx-adept-a").state).toEqual({
      kind: "unlockable",
    })
  })
})

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

/** The recommender bound to an empty Skill catalog: every node resolves to zero
 *  damage types, so the `new-damage-type` reason never fires — the baseline for
 *  the Origin/in-progress/Path-fit cases. The damage-type block binds a seeded
 *  catalog instead. */
const recommend = getAtlasRecommendations({ getSkill: () => undefined })

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

    const result = recommend(view, "health-focused", 5)

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

    const result = recommend(view, "balanced", 5)

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

    const result = recommend(view, "skill-focused", 5)

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
        recommend(view, "skill-focused", 5).map(
          (r) => r.archetype
        )
      )
    ).toEqual(["mage"])
    expect(
      keysOf(
        recommend(view, "health-focused", 5).map(
          (r) => r.archetype
        )
      )
    ).toEqual(["warrior"])
    expect(
      keysOf(
        recommend(view, "balanced", 5).map((r) => r.archetype)
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

    const result = recommend(view, "balanced", 5)

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

    expect(recommend(view, "balanced", 5)).toEqual([])
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

    const keys = recommend(view, "health-focused", 5).map(
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

    const keys = recommend(view, "health-focused", 5).map(
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

    const keys = recommend(view, "health-focused", 5).map(
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

    expect(recommend(view, "skill-focused", 5)).toHaveLength(1)
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

    expect(recommend(view, "health-focused", 5)).toEqual([])
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

    expect(recommend(view, "skill-focused", 1)).toHaveLength(1)
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
      recommend(
        makeView({ savedRanks: 0, lineages: [candidate] }),
        "skill-focused",
        30
      )
    ).toEqual([])
    expect(
      recommend(
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

    expect(recommend(view, "skill-focused", 5)).toEqual([])
  })

  it("prefers a rank-up over a fresh unlock at the same tier in the Origin Lineage", () => {
    // Both Origin-Lineage nodes are Initiate, so tier can't decide: the owned
    // (rank-up) node must win over the unlockable one via actionRank. The owned
    // node's key sorts later, so the localeCompare tie-break alone would pick the
    // fresh one — isolating actionRank as the discriminator.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            { key: "a-fresh", lineage: "warrior", tier: "initiate" }
          ),
          node(
            { kind: "owned", rank: 2 },
            { key: "z-owned", lineage: "warrior", tier: "initiate" },
            "a1"
          ),
        ]),
      ],
    })

    expect(recommend(view, "balanced", 5)[0]!.archetype.key).toBe(
      "z-owned"
    )
  })

  it("breaks an Origin tie by Archetype key when tier and action match", () => {
    // Two unlockable Initiates in the Origin Lineage: only localeCompare on key
    // can order them, so the lexicographically-smaller key must lead.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            { key: "zeta", lineage: "warrior", tier: "initiate" }
          ),
          node(
            { kind: "unlockable" },
            { key: "alpha", lineage: "warrior", tier: "initiate" }
          ),
        ]),
      ],
    })

    expect(recommend(view, "balanced", 5)[0]!.archetype.key).toBe(
      "alpha"
    )
  })

  it("orders the Origin pick by tier ahead of action and key", () => {
    // The Initiate is a fresh unlock (actionRank 1, key 'z') and the Adept is a
    // rank-up (actionRank 0, key 'a'). If tier did not lead the sort, actionRank
    // would surface the Adept; tier must put the Initiate first.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            { key: "z-initiate", lineage: "warrior", tier: "initiate" }
          ),
          node(
            { kind: "owned", rank: 2 },
            { key: "a-adept", lineage: "warrior", tier: "adept" },
            "a1"
          ),
        ]),
      ],
    })

    expect(recommend(view, "balanced", 5)[0]!.archetype.key).toBe(
      "z-initiate"
    )
  })

  it("orders two same-tier Origin candidates by key, not by their summed tier", () => {
    // Both Origin candidates are Adepts (tier rank 1), enumerated z-then-y. The
    // correct tier *difference* is 0, so the key tie-break must surface 'y'
    // first. A tier *sum* (1+1=2) would be non-zero, short-circuit the key, and
    // leave the input order — so 'z' would wrongly lead.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            { key: "z-adept", lineage: "warrior", tier: "adept" }
          ),
          node(
            { kind: "unlockable" },
            { key: "y-adept", lineage: "warrior", tier: "adept" }
          ),
        ]),
      ],
    })

    expect(recommend(view, "balanced", 5)[0]!.archetype.key).toBe(
      "y-adept"
    )
  })

  it("draws Slot 1 only from the Origin Lineage when one is actionable", () => {
    // A non-origin Initiate sorts before the Origin Adept on every tie-break
    // except the Origin filter. Slot 1 must still be the Origin Archetype,
    // badged origin-lineage, and the non-origin node fills a later slot.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            { key: "warrior-adept", lineage: "warrior", tier: "adept" }
          ),
        ]),
        lineageEntry(
          "knight",
          [
            node(
              { kind: "unlockable" },
              { key: "aaa-knight", lineage: "knight", tier: "initiate" }
            ),
          ],
          1
        ),
      ],
    })

    const result = recommend(view, "health-focused", 5)

    expect(result[0]!.archetype.key).toBe("warrior-adept")
    expect(result[0]!.reason).toBe("origin-lineage")
    expect(result.map((r) => r.archetype.key)).toEqual([
      "warrior-adept",
      "aaa-knight",
    ])
  })

  it("skips the Origin slot entirely when the Origin Lineage offers nothing", () => {
    // Origin Lineage's only node is mastered (not recommendable). The fill pool
    // must still produce a pick, and it must not be badged origin-lineage.
    const view = makeView({
      originLineage: "warrior",
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "mastered", rank: 5 },
            { key: "warrior", lineage: "warrior", tier: "initiate" },
            "a1"
          ),
        ]),
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            { key: "mage", lineage: "mage", tier: "initiate" }
          ),
        ]),
      ],
    })

    const result = recommend(view, "skill-focused", 5)

    expect(result.map((r) => r.archetype.key)).toEqual(["mage"])
    expect(result[0]!.reason).toBe("fits-path")
  })

  it("ranks in-progress Lineages strictly ahead of untouched on-Path ones", () => {
    // Both nodes are unlockable Initiates, so actionRank and tierRank tie; the
    // on-Path untouched node even has the earlier key, so the localeCompare
    // tie-break favors it. Only the ownedInLineage primary key — which reads
    // '> 0', not '>= 0' (else both sides are 1 and the rule vanishes) — keeps
    // the in-progress Lineage ahead.
    const view = makeView({
      lineages: [
        lineageEntry("bard", [
          node(
            { kind: "unlockable" },
            { key: "aaa-onpath", lineage: "bard", tier: "initiate" }
          ),
        ]),
        lineageEntry(
          "mage",
          [
            node(
              { kind: "unlockable" },
              { key: "zzz-inprogress", lineage: "mage", tier: "initiate" }
            ),
          ],
          1
        ),
      ],
    })

    expect(
      recommend(view, "skill-focused", 5).map(
        (r) => r.archetype.key
      )
    ).toEqual(["zzz-inprogress", "aaa-onpath"])
  })

  it("within one fill pool, prefers a rank-up before a fresh unlock", () => {
    // Two in-progress on-Path nodes, same tier: the owned one (actionRank 0)
    // leads the unlockable one (actionRank 1) despite a later key.
    const view = makeView({
      lineages: [
        lineageEntry(
          "mage",
          [
            node(
              { kind: "unlockable" },
              { key: "aaa-fresh", lineage: "mage", tier: "initiate" }
            ),
            node(
              { kind: "owned", rank: 2 },
              { key: "zzz-rankup", lineage: "mage", tier: "initiate" },
              "a1"
            ),
          ],
          2
        ),
      ],
    })

    expect(
      recommend(view, "skill-focused", 5).map(
        (r) => r.archetype.key
      )
    ).toEqual(["zzz-rankup", "aaa-fresh"])
  })

  it("orders fill candidates by tier even across Lineages", () => {
    // The Elite is enumerated first (its Lineage comes first), so candidate
    // order is tier-descending; only a real tier subtraction can re-sort the
    // Initiate ahead. The Elite also has the earlier key, so the localeCompare
    // tie-break would keep it first if tierRank were dropped — isolating tier.
    const view = makeView({
      lineages: [
        lineageEntry(
          "warrior",
          [
            node(
              { kind: "unlockable" },
              { key: "aaa-elite", lineage: "warrior", tier: "elite" }
            ),
          ],
          1
        ),
        lineageEntry(
          "mage",
          [
            node(
              { kind: "unlockable" },
              { key: "zzz-initiate", lineage: "mage", tier: "initiate" }
            ),
          ],
          1
        ),
      ],
    })

    expect(
      recommend(view, "skill-focused", 5).map(
        (r) => r.archetype.key
      )
    ).toEqual(["zzz-initiate", "aaa-elite"])
  })

  it("breaks an otherwise-equal fill tie by Archetype key", () => {
    // Two in-progress unlockable Initiates: only localeCompare can order them.
    const view = makeView({
      lineages: [
        lineageEntry(
          "mage",
          [
            node(
              { kind: "unlockable" },
              { key: "zeta", lineage: "mage", tier: "initiate" }
            ),
            node(
              { kind: "unlockable" },
              { key: "alpha", lineage: "mage", tier: "initiate" }
            ),
          ],
          2
        ),
      ],
    })

    expect(
      recommend(view, "skill-focused", 5).map(
        (r) => r.archetype.key
      )
    ).toEqual(["alpha", "zeta"])
  })

  it("caps the list at exactly three even when more are eligible", () => {
    const view = makeView({
      lineages: [
        lineageEntry(
          "mage",
          [
            node(
              { kind: "unlockable" },
              { key: "m1", lineage: "mage", tier: "initiate" }
            ),
            node(
              { kind: "unlockable" },
              { key: "m2", lineage: "mage", tier: "adept" }
            ),
            node(
              { kind: "unlockable" },
              { key: "m3", lineage: "mage", tier: "elite" }
            ),
            node(
              { kind: "unlockable" },
              { key: "m4", lineage: "mage", tier: "paragon" }
            ),
          ],
          4
        ),
      ],
    })

    const keys = recommend(view, "skill-focused", 5).map(
      (r) => r.archetype.key
    )
    expect(keys).toEqual(["m1", "m2", "m3"])
  })
})

describe("getAtlasRecommendations — new-damage-type reason (UNN-277)", () => {
  // A skill catalog mapping fixture Skill keys to concrete damage types, so a
  // node's Skills resolve to coverage; `passive-x` deliberately carries none.
  const recommendWith = getAtlasRecommendations(
    makeTestGameData({
      skills: [
        makeAttackSkill({ key: "agi", damageType: "fire" }),
        makeAttackSkill({ key: "bufu", damageType: "ice" }),
        makeAttackSkill({ key: "elemental-apocalypse", damageType: "special" }),
      ],
    })
  )

  it("surfaces an off-Path Lineage that teaches a damage type the character lacks", () => {
    // Skill-focused character, Warrior (a health-Path Lineage) untouched: it is
    // off-Path, so the Path/in-progress pools never reach it — only the missing
    // Fire coverage pulls it in, badged new-damage-type.
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
              skills: [{ rank: 1, skill: "agi" }],
            }
          ),
        ]),
      ],
    })

    const result = recommendWith(view, "skill-focused", 5)

    expect(result.map((r) => r.archetype.key)).toEqual(["warrior"])
    expect(result[0]!.reason).toBe("new-damage-type")
  })

  it("does not surface an off-Path Lineage whose damage type the character already has", () => {
    // Mage (on-Path, owned) already grants Fire, so the untouched off-Path
    // Warrior's Fire adds nothing and stays hidden; the untouched off-Path
    // Knight's Ice is new, so it surfaces.
    const view = makeView({
      lineages: [
        lineageEntry("mage", [
          node(
            { kind: "owned", rank: 3 },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
              skills: [{ rank: 1, skill: "agi" }],
            },
            "a1"
          ),
        ]),
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
              skills: [{ rank: 1, skill: "agi" }],
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
              skills: [{ rank: 1, skill: "bufu" }],
            }
          ),
        ]),
      ],
    })

    const result = recommendWith(view, "skill-focused", 5)

    expect(result.map((r) => r.archetype.key)).toEqual(["mage", "knight"])
    expect(result.map((r) => r.reason)).toEqual([
      "unlocked-archetype",
      "new-damage-type",
    ])
  })

  it("keeps an on-Path Lineage badged fits-path even when it also adds a new damage type", () => {
    const view = makeView({
      lineages: [
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "mage",
              lineage: "mage",
              tier: "initiate",
              skills: [{ rank: 1, skill: "agi" }],
            }
          ),
        ]),
      ],
    })

    const result = recommendWith(view, "skill-focused", 5)

    expect(result.map((r) => r.archetype.key)).toEqual(["mage"])
    expect(result[0]!.reason).toBe("fits-path")
  })

  it("ranks a new-damage-type pick below an on-Path fits-path pick", () => {
    // The off-Path Warrior sorts first alphabetically, so only the strict
    // fits-path-before-new-damage-type priority can place the Mage ahead.
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            {
              key: "aaa-warrior",
              lineage: "warrior",
              tier: "initiate",
              skills: [{ rank: 1, skill: "bufu" }],
            }
          ),
        ]),
        lineageEntry("mage", [
          node(
            { kind: "unlockable" },
            {
              key: "zzz-mage",
              lineage: "mage",
              tier: "initiate",
              skills: [{ rank: 1, skill: "agi" }],
            }
          ),
        ]),
      ],
    })

    const result = recommendWith(view, "skill-focused", 5)

    expect(result.map((r) => r.archetype.key)).toEqual([
      "zzz-mage",
      "aaa-warrior",
    ])
    expect(result.map((r) => r.reason)).toEqual(["fits-path", "new-damage-type"])
  })

  it("ignores the multi-element 'special' bucket as a damage type", () => {
    // The only Skill an off-Path Warrior carries deals 'special' damage, which
    // is not a single resistible type, so it never counts as new coverage.
    const view = makeView({
      lineages: [
        lineageEntry("warrior", [
          node(
            { kind: "unlockable" },
            {
              key: "warrior",
              lineage: "warrior",
              tier: "initiate",
              skills: [{ rank: 1, skill: "elemental-apocalypse" }],
            }
          ),
        ]),
      ],
    })

    expect(recommendWith(view, "skill-focused", 5)).toEqual([])
  })
})
