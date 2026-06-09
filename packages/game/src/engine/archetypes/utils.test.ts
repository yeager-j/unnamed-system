import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill,
  makePassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  getArchetypeDisplay,
  previewArchetypeSkills,
  sortArchetypesByPath,
} from "@workspace/game/engine/archetypes/utils"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import { type Archetype } from "@workspace/game/foundation/archetypes/schema"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type Lineage,
} from "@workspace/game/foundation/character/lineage"
import { type Skill } from "@workspace/game/foundation/skills/schema"

/**
 * Real {@link import("@workspace/game/foundation/skills/schema").SkillKey}s used
 * as **opaque identifiers**: every test below assigns each one's Rank in a
 * fixture Archetype, so they assert resolution/grouping *behavior*, never the
 * shipped catalog's balance. A rebalance of any of these can't break this slice.
 */
const W1 = "cleave"
const W2 = "windblade"
const SYN = "elemental-apocalypse"
const M1 = "zio"
const K1 = "skewer" // fixture Knight Rank 1
const K5 = "auto-rakukaja" // fixture Knight Rank 5

const fxSkill = (key: string): Skill => ({
  kind: "passive",
  key,
  name: key,
  tagline: key,
  description: key,
  isSynthesis: false,
  effects: [],
})

const fxWarrior = makeArchetype({
  key: "warrior",
  name: "Fixture Warrior",
  lineage: "warrior",
  mechanic: "perfection",
  skills: [
    { skill: W1, rank: 1 },
    { skill: W2, rank: 2 },
  ],
  synthesisSkill: { skill: SYN, rank: 5 },
})
const fxMage = makeArchetype({
  key: "mage",
  name: "Fixture Mage",
  lineage: "mage",
  skills: [{ skill: M1, rank: 1 }],
})
const fxKnight = makeArchetype({
  key: "knight",
  name: "Fixture Knight",
  lineage: "knight",
  skills: [
    { skill: K1, rank: 1 },
    { skill: K5, rank: 5 },
  ],
})
const fxWarlock = makeArchetype({
  key: "warlock",
  name: "Fixture Warlock",
  lineage: "warlock",
})

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior, fxMage, fxKnight, fxWarlock],
  skills: [W1, W2, SYN, M1, K1, K5].map(fxSkill),
})

const character = (
  overrides: Parameters<typeof makeHydratedCharacter>[0] = {}
) => makeHydratedCharacter(overrides, TEST_DATA)
const entriesOf = (c: ReturnType<typeof character>) =>
  buildArchetypeEntries(c, TEST_DATA)

describe("sortArchetypesByPath", () => {
  // One synthetic Archetype per Lineage, picked by its foundation-declared
  // suggested Path — the sort reads only `lineage`, so this exercises the
  // bucket + canonical ordering without any catalog content.
  const arch = (lineage: Lineage): Archetype =>
    makeArchetype({ key: `fx-${lineage}`, lineage, tier: "initiate" })
  const HEALTH = "warrior" // LINEAGE_SUGGESTED_PATH.warrior === "health"
  const BALANCED = "healer" // === "balanced"
  const SKILL = "mage" // === "skill"

  it("agrees with the foundation suggested-path vocabulary", () => {
    expect(LINEAGE_SUGGESTED_PATH[HEALTH]).toBe("health")
    expect(LINEAGE_SUGGESTED_PATH[BALANCED]).toBe("balanced")
    expect(LINEAGE_SUGGESTED_PATH[SKILL]).toBe("skill")
  })

  const mixed = [arch(SKILL), arch(BALANCED), arch(HEALTH)]

  it("leads with the health bucket under health-focused", () => {
    expect(
      sortArchetypesByPath(mixed, "health-focused").map((a) => a.lineage)
    ).toEqual([HEALTH, BALANCED, SKILL])
  })

  it("leads with the balanced bucket under balanced", () => {
    expect(
      sortArchetypesByPath(mixed, "balanced").map((a) => a.lineage)
    ).toEqual([BALANCED, HEALTH, SKILL])
  })

  it("leads with the skill bucket under skill-focused", () => {
    expect(
      sortArchetypesByPath(mixed, "skill-focused").map((a) => a.lineage)
    ).toEqual([SKILL, BALANCED, HEALTH])
  })

  // Each pair is fed in reverse of the expected order, so a dropped bucket label
  // (which makes that bucket's rank undefined and the comparator a no-op) leaves
  // the input order intact and fails the assertion — pinning every entry of the
  // skill-focused bucket order: skill → balanced → health.
  it("orders the balanced bucket ahead of health under skill-focused", () => {
    expect(
      sortArchetypesByPath([arch(HEALTH), arch(BALANCED)], "skill-focused").map(
        (a) => a.lineage
      )
    ).toEqual([BALANCED, HEALTH])
  })

  it("orders the skill bucket ahead of health under skill-focused", () => {
    expect(
      sortArchetypesByPath([arch(HEALTH), arch(SKILL)], "skill-focused").map(
        (a) => a.lineage
      )
    ).toEqual([SKILL, HEALTH])
  })

  it("breaks within-bucket ties by canonical LINEAGES order, regardless of input order", () => {
    // warrior (idx 0) and knight (idx 3) are both health Lineages.
    const knight = arch("knight")
    const warrior = arch("warrior")
    expect(
      sortArchetypesByPath([knight, warrior], "health-focused").map(
        (a) => a.lineage
      )
    ).toEqual(["warrior", "knight"])
    expect(LINEAGES.indexOf("warrior")).toBeLessThan(LINEAGES.indexOf("knight"))
  })

  it("keeps a bucket's Lineages ahead of a later bucket even when input is reversed", () => {
    expect(
      sortArchetypesByPath([arch(SKILL), arch(HEALTH)], "health-focused").map(
        (a) => a.lineage
      )
    ).toEqual([HEALTH, SKILL])
  })

  it("does not mutate its input and returns a new array", () => {
    const input = [arch(SKILL), arch(HEALTH)]
    const before = input.map((a) => a.key)
    const returned = sortArchetypesByPath(input, "health-focused")
    expect(input.map((a) => a.key)).toEqual(before)
    expect(returned).not.toBe(input)
  })
})

describe("previewArchetypeSkills", () => {
  it("returns one RankedSkill per declared Skill, preserving the Ranks", () => {
    const { ranks } = previewArchetypeSkills(fxWarrior, "balanced", TEST_DATA)
    expect(ranks).toHaveLength(fxWarrior.skills.length)
    expect(ranks.map((skill) => skill.rank).sort()).toEqual([1, 2])
  })

  it("drops a ranked Skill whose key does not resolve", () => {
    const arch = makeArchetype({
      key: "fx",
      skills: [
        { skill: W1, rank: 1 },
        { skill: W2, rank: 2 },
      ],
    })
    const data = makeTestGameData({ archetypes: [arch], skills: [fxSkill(W1)] })
    const { ranks } = previewArchetypeSkills(arch, "balanced", data)
    expect(ranks.map((skill) => skill.key)).toEqual([W1])
  })

  it("marks a passive Skill's resolvedAttackRoll null", () => {
    const { ranks } = previewArchetypeSkills(fxWarrior, "balanced", TEST_DATA)
    expect(ranks.every((skill) => skill.resolvedAttackRoll === null)).toBe(true)
  })

  it("resolves the Synthesis Skill alongside the ranked Skills", () => {
    const { synthesis } = previewArchetypeSkills(
      fxWarrior,
      "balanced",
      TEST_DATA
    )
    expect(synthesis).toMatchObject({ key: SYN, rank: 5 })
  })

  it("has no synthesis when the Archetype declares none", () => {
    const { synthesis } = previewArchetypeSkills(
      makeArchetype({ synthesisSkill: undefined }),
      "balanced",
      TEST_DATA
    )
    expect(synthesis).toBeNull()
  })
})

describe("buildArchetypeEntries", () => {
  it("builds one entry per resolvable Archetype row", () => {
    const entries = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
          makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
        ],
      })
    )
    expect(entries.map((e) => e.archetype.key)).toEqual(["warrior", "mage"])
  })

  it("skips a row whose archetypeKey no longer resolves to a catalog entry", () => {
    const entries = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
          makeArchetypeRow({ id: "ghost", archetypeKey: "no-such-archetype" }),
        ],
      })
    )
    expect(entries.map((e) => e.archetype.key)).toEqual(["warrior"])
  })

  it("flags the row matching activeArchetypeId as active and the rest inactive", () => {
    const entries = entriesOf(
      character({
        row: { activeArchetypeId: "b" },
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
          makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
        ],
      })
    )
    expect(entries.find((e) => e.row.id === "a")?.isActive).toBe(false)
    expect(entries.find((e) => e.row.id === "b")?.isActive).toBe(true)
  })

  it("resolves every Rank-keyed Skill the Archetype declares", () => {
    const [entry] = entriesOf(
      character({
        archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
      })
    )
    expect(entry!.ranks.map((r) => r.rank).sort()).toEqual([1, 2])
  })

  it("resolves the Synthesis Skill the Archetype declares", () => {
    const [entry] = entriesOf(
      character({
        archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
      })
    )
    expect(entry!.synthesis).toMatchObject({ key: SYN, rank: 5 })
  })

  it("produces one resolved slot per inheritanceSlots entry on the row", () => {
    const [entry] = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "a",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: null,
                skillKey: null,
              },
              {
                slotIndex: 1,
                sourceCharacterArchetypeId: null,
                skillKey: null,
              },
            ],
          }),
        ],
      })
    )
    expect(entry!.slots.map((s) => s.slotIndex)).toEqual([0, 1])
  })

  it("treats an empty slot (null skillKey) as valid with no resolved Skill or source", () => {
    const [entry] = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "a",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: null,
                skillKey: null,
              },
            ],
          }),
        ],
      })
    )
    expect(entry!.slots[0]).toMatchObject({
      sourceArchetype: null,
      resolved: null,
      isValid: true,
    })
  })

  it("resolves a configured slot to its source Archetype and filling Skill, marking it valid", () => {
    const owner = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "owner",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: "src",
                skillKey: K1,
              },
            ],
          }),
          makeArchetypeRow({ id: "src", archetypeKey: "knight", rank: 5 }),
        ],
      })
    ).find((e) => e.row.id === "owner")!
    expect(owner.slots[0]!.sourceArchetype?.key).toBe("knight")
    expect(owner.slots[0]!.resolved?.key).toBe(K1)
    expect(owner.slots[0]!.isValid).toBe(true)
  })

  it("marks a configured slot invalid when the source Rank no longer unlocks its Skill", () => {
    const owner = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "owner",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: "src",
                skillKey: K5,
              },
            ],
          }),
          makeArchetypeRow({ id: "src", archetypeKey: "knight", rank: 1 }),
        ],
      })
    ).find((e) => e.row.id === "owner")!
    expect(owner.slots[0]!.isValid).toBe(false)
  })

  it("marks a configured slot invalid when its source row no longer exists", () => {
    const [owner] = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "owner",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: "missing-src",
                skillKey: K1,
              },
            ],
          }),
        ],
      })
    )
    expect(owner!.slots[0]!.sourceArchetype).toBeNull()
    expect(owner!.slots[0]!.isValid).toBe(false)
  })

  it("leaves a configured slot's resolved Skill null when its skillKey no longer resolves", () => {
    const owner = entriesOf(
      character({
        archetypeRows: [
          makeArchetypeRow({
            id: "owner",
            archetypeKey: "warrior",
            inheritanceSlots: [
              {
                slotIndex: 0,
                sourceCharacterArchetypeId: "src",
                skillKey: "no-such-skill",
              },
            ],
          }),
          makeArchetypeRow({ id: "src", archetypeKey: "knight", rank: 5 }),
        ],
      })
    ).find((e) => e.row.id === "owner")!
    expect(owner.slots[0]!.resolved).toBeNull()
    expect(owner.slots[0]!.isValid).toBe(false)
  })
})

describe("getArchetypeDisplay", () => {
  it("returns the active Archetype entry as the spotlight", () => {
    const c = character({
      row: { activeArchetypeId: "b" },
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
      ],
    })
    expect(getArchetypeDisplay(c, TEST_DATA).activeEntry?.row.id).toBe("b")
  })

  it("returns a null spotlight when no row is active", () => {
    const c = character({
      row: { activeArchetypeId: null },
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    expect(getArchetypeDisplay(c, TEST_DATA).activeEntry).toBeNull()
  })
})

describe("archetypeSwitcherGroups", () => {
  it("groups unlocked Archetypes by Lineage", () => {
    const groups = archetypeSwitcherGroups(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
          makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
        ],
      }),
      TEST_DATA
    )
    expect(groups.map((g) => g.lineage)).toEqual(["warrior", "mage"])
    expect(groups[0]!.options.map((o) => o.id)).toEqual(["a"])
    expect(groups[1]!.options.map((o) => o.id)).toEqual(["b"])
  })

  it("skips a row whose archetypeKey no longer resolves", () => {
    const groups = archetypeSwitcherGroups(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
          makeArchetypeRow({ id: "ghost", archetypeKey: "no-such-archetype" }),
        ],
      }),
      TEST_DATA
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.options.map((o) => o.id)).toEqual(["a"])
  })

  it("orders groups by the canonical LINEAGES order regardless of row order", () => {
    const groups = archetypeSwitcherGroups(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "w", archetypeKey: "warlock" }),
          makeArchetypeRow({ id: "k", archetypeKey: "knight" }),
          makeArchetypeRow({ id: "m", archetypeKey: "mage" }),
        ],
      }),
      TEST_DATA
    )
    expect(groups.map((g) => g.lineage)).toEqual(["mage", "knight", "warlock"])
  })

  it("carries each option's id, name, tier, and current rank", () => {
    const [group] = archetypeSwitcherGroups(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior", rank: 3 }),
        ],
      }),
      TEST_DATA
    )
    expect(group!.options[0]).toMatchObject({
      id: "a",
      name: fxWarrior.name,
      tier: fxWarrior.tier,
      rank: 3,
    })
  })

  it("keeps every unlocked row of one Lineage in that Lineage's single group", () => {
    const groups = archetypeSwitcherGroups(
      character({
        archetypeRows: [
          makeArchetypeRow({ id: "w1", archetypeKey: "warrior", rank: 1 }),
          makeArchetypeRow({ id: "w2", archetypeKey: "warrior", rank: 4 }),
        ],
      }),
      TEST_DATA
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.lineage).toBe("warrior")
    expect(groups[0]!.options.map((o) => o.id).sort()).toEqual(["w1", "w2"])
  })

  it("resolves the Archetype's Mechanic display name", () => {
    const [group] = archetypeSwitcherGroups(
      character({
        archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
      }),
      TEST_DATA
    )
    expect(group!.options[0]!.mechanicName).toBe(
      getMechanic(fxWarrior.mechanic!)!.displayName
    )
    expect(group!.options[0]!.mechanicName).not.toBeNull()
  })

  it("leaves the Mechanic display name null when the Archetype has no Mechanic", () => {
    const [group] = archetypeSwitcherGroups(
      character({
        archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warlock" })],
      }),
      TEST_DATA
    )
    expect(group!.options[0]!.mechanicName).toBeNull()
  })
})

// A fixture Mage whose active Archetype declares (a) a magical attack Skill that
// makes an MA Attack Roll and (b) a Magic-Circle-style `perPartyLineage` passive
// filtered on magical delivery — so the passive boosts the attack Skill's card
// by the party count. Proves the new combat-context arg threads
// `partyComposition` into `buildArchetypeEntries`'s per-Skill Attack Rolls.
describe("buildArchetypeEntries — perPartyLineage combat context", () => {
  const PARTY_ATTACK = "garu"
  const PARTY_CIRCLE = "magic-circle"

  const partyMage = makeArchetype({
    key: "party-mage",
    name: "Party Mage",
    lineage: "mage",
    skills: [
      { skill: PARTY_ATTACK, rank: 1 },
      { skill: PARTY_CIRCLE, rank: 1 },
    ],
  })

  const PARTY_DATA = makeTestGameData({
    archetypes: [partyMage],
    skills: [
      makeAttackSkill({
        key: PARTY_ATTACK,
        delivery: "magical",
        attackRoll: { attribute: "ma", tiers: [] },
      }),
      makePassiveSkill({
        key: PARTY_CIRCLE,
        name: "Magic Circle",
        effects: [
          {
            type: "attackRoll",
            when: { deliveries: ["magical"] },
            scaler: {
              kind: "perPartyLineage",
              lineage: "mage",
              amount: 1,
              includesSelf: true,
            },
            source: "Magic Circle",
          },
        ],
      }),
    ],
  })

  const partyMageCharacter = makeHydratedCharacter(
    {
      row: { activeArchetypeId: "pm" },
      archetypeRows: [
        makeArchetypeRow({ id: "pm", archetypeKey: "party-mage", rank: 1 }),
      ],
    },
    PARTY_DATA
  )

  const attackRollOf = (
    context?: Parameters<typeof buildArchetypeEntries>[2]
  ) =>
    buildArchetypeEntries(
      partyMageCharacter,
      PARTY_DATA,
      context
    )[0]!.ranks.find((rank) => rank.key === PARTY_ATTACK)!.resolvedAttackRoll

  it("resolves base Attack values with no combat context", () => {
    const base = attackRollOf()
    expect(base!.sources.some((s) => s.source === "Magic Circle")).toBe(false)
  })

  it("scales the per-party passive by the supplied composition", () => {
    const base = attackRollOf()
    const scaled = attackRollOf({ partyComposition: { mage: 3 } })
    expect(scaled!.total - base!.total).toBe(3)
    expect(scaled!.sources).toContainEqual({
      source: "Magic Circle",
      amount: 3,
    })
  })
})
