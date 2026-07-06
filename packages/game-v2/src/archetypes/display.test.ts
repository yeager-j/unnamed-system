import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { InheritanceSlot } from "@workspace/game-v2/archetypes/archetypes.schema"
import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  getArchetypeDisplay,
  previewArchetypeSkills,
  sortArchetypesByPath,
} from "@workspace/game-v2/archetypes/display"
import { inheritanceSourceGroups } from "@workspace/game-v2/archetypes/inheritance"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

// — fixtures —

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "attack",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

const cleave = skill({
  key: "cleave",
  cost: { kind: "sp", amount: 5 },
  attackRoll: { attribute: "st", tiers: [] },
  damage: { damageType: "slash", delivery: "physical" },
})
const tempestSlash = skill({
  key: "tempest-slash",
  cost: { kind: "sp", amount: 9 },
  attackRoll: { attribute: "st", tiers: [] },
  damage: { damageType: "wind", delivery: "physical" },
})
const slashBoost = skill({ key: "slash-boost", kind: "passive" })
const peerless = skill({ key: "peerless", isSynthesis: true })
const fireball = skill({
  key: "fireball",
  cost: { kind: "sp", amount: 4 },
  attackRoll: { attribute: "ma", tiers: [] },
  damage: { damageType: "fire", delivery: "magical" },
})

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

const warrior = archetype({
  key: "warrior",
  lineage: "warrior",
  attributes: { strength: 3, magic: 0, agility: 0, luck: 0 },
  skills: [
    { rank: 1, skill: "cleave" },
    { rank: 3, skill: "tempest-slash" },
    { rank: 5, skill: "slash-boost" },
  ],
  synthesisSkill: { rank: 5, skill: "peerless" },
})
const mage = archetype({
  key: "mage",
  lineage: "mage",
  attributes: { strength: 0, magic: 4, agility: 0, luck: 0 },
  skills: [{ rank: 1, skill: "fireball" }],
})

const data: GameData = {
  getArchetype: (key) => ({ warrior, mage })[key as "warrior" | "mage"],
  allArchetypes: () => [warrior, mage],
  getItem: () => undefined,
  getEquippableItem: () => undefined,
  getSkill: (key) =>
    [cleave, tempestSlash, slashBoost, peerless, fireball].find(
      (s) => s.key === key
    ),
  getEnemy: () => undefined,
  startingWeaponForLineage: () => undefined,
}

function resolvedPC(
  roster: Array<{
    key: string
    rank: number
    inheritanceSlots?: InheritanceSlot[]
  }>,
  active: string | null
): ResolvedEntity {
  const entity: Entity = {
    id: "pc",
    components: {
      level: { value: 5 },
      path: { choice: "health-focused" },
      archetypes: {
        active,
        origin: active,
        savedArchetypeRanks: 0,
        roster: roster.map((r) => ({
          key: r.key,
          rank: r.rank,
          inheritanceSlots: r.inheritanceSlots ?? [],
        })),
      },
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage: 0 },
      skillPool: { base: 0, spSpent: 0 },
    },
  }
  return createResolve(data)(entity)
}

describe("buildArchetypeEntries (C1–C5 — off the ResolvedEntity)", () => {
  it("returns [] for an entity with no Archetypes component", () => {
    const enemy: ResolvedEntity = { id: "e", components: {} }
    expect(buildArchetypeEntries(data)(enemy)).toEqual([])
  })

  it("one entry per roster Archetype in roster order; flags the active one (by key, C2)", () => {
    const entries = buildArchetypeEntries(data)(
      resolvedPC(
        [
          { key: "warrior", rank: 3 },
          { key: "mage", rank: 1 },
        ],
        "mage"
      )
    )
    expect(entries.map((e) => e.key)).toEqual(["warrior", "mage"])
    expect(entries.map((e) => e.isActive)).toEqual([false, true])
  })

  it("skips a roster key that no longer resolves to a catalog Archetype (drift)", () => {
    const entries = buildArchetypeEntries(data)(
      resolvedPC([{ key: "ghost", rank: 1 }], "ghost")
    )
    expect(entries).toEqual([])
  })

  it("resolves Rank-keyed Skill costs + Attack Rolls against the live resolved stats (C4)", () => {
    const [entry] = buildArchetypeEntries(data)(
      resolvedPC([{ key: "warrior", rank: 5 }], "warrior")
    )
    expect(entry!.ranks.map((r) => r.skill.key)).toEqual([
      "cleave",
      "tempest-slash",
      "slash-boost",
    ])
    expect(entry!.ranks[0]!.resolvedCost).toEqual({ kind: "sp", amount: 5 })
    // strength base 0 + archetype 3 ⇒ Attack Roll total 3
    expect(entry!.ranks[0]!.resolvedAttackRoll?.total).toBe(3)
    // a passive carries no Attack Roll
    expect(entry!.ranks[2]!.resolvedAttackRoll).toBeNull()
  })

  it("resolves the Synthesis Skill (or null)", () => {
    const [warriorEntry, mageEntry] = buildArchetypeEntries(data)(
      resolvedPC(
        [
          { key: "warrior", rank: 5 },
          { key: "mage", rank: 1 },
        ],
        "warrior"
      )
    )
    expect(warriorEntry!.synthesis?.skill.key).toBe("peerless")
    expect(mageEntry!.synthesis).toBeNull()
  })
})

describe("buildArchetypeEntries — inheritance slot validity (C5, key-based)", () => {
  const slots: InheritanceSlot[] = [
    { slotIndex: 0, sourceArchetypeKey: "mage", skillKey: "fireball" }, // valid
    { slotIndex: 1, sourceArchetypeKey: null, skillKey: null }, // empty ⇒ valid
    { slotIndex: 2, sourceArchetypeKey: "mage", skillKey: "tempest-slash" }, // not a mage skill ⇒ invalid
    { slotIndex: 3, sourceArchetypeKey: "ghost", skillKey: "fireball" }, // source not in roster ⇒ invalid
  ]

  const resolved = resolvedPC(
    [
      { key: "warrior", rank: 3, inheritanceSlots: slots },
      { key: "mage", rank: 1 },
    ],
    "warrior"
  )
  const [warriorEntry] = buildArchetypeEntries(data)(resolved)

  it("a configured slot from an owned source at an unlocked rank is valid", () => {
    const slot = warriorEntry!.slots[0]!
    expect(slot.isValid).toBe(true)
    expect(slot.sourceArchetype?.key).toBe("mage")
    expect(slot.resolved?.skill.key).toBe("fireball")
  })

  it("an empty slot is always valid with null source/resolved", () => {
    const slot = warriorEntry!.slots[1]!
    expect(slot.isValid).toBe(true)
    expect(slot.sourceArchetype).toBeNull()
    expect(slot.resolved).toBeNull()
  })

  it("a slot whose Skill the source doesn't offer is invalid", () => {
    expect(warriorEntry!.slots[2]!.isValid).toBe(false)
  })

  it("a slot whose source key is not in the roster is invalid (stale), source null", () => {
    const slot = warriorEntry!.slots[3]!
    expect(slot.isValid).toBe(false)
    expect(slot.sourceArchetype).toBeNull()
  })
})

describe("getArchetypeDisplay (C6)", () => {
  it("returns the active entry, or null when none is active", () => {
    const resolved = resolvedPC([{ key: "warrior", rank: 3 }], "warrior")
    expect(getArchetypeDisplay(data)(resolved).activeEntry?.key).toBe("warrior")
    const inactive = resolvedPC([{ key: "warrior", rank: 3 }], null)
    expect(getArchetypeDisplay(data)(inactive).activeEntry).toBeNull()
  })
})

describe("archetypeSwitcherGroups (C8–C10)", () => {
  it("groups unlocked Archetypes by Lineage in canonical order, keyed by key", () => {
    const groups = archetypeSwitcherGroups(data)(
      resolvedPC(
        [
          { key: "mage", rank: 1 },
          { key: "warrior", rank: 3 },
        ],
        "warrior"
      )
    )
    // warrior Lineage precedes mage in LINEAGES order, regardless of roster order
    expect(groups.map((g) => g.lineage)).toEqual(["warrior", "mage"])
    expect(groups[0]!.options[0]).toMatchObject({
      key: "warrior",
      name: "warrior",
      tier: "initiate",
      rank: 3,
      mechanicName: null,
    })
  })
})

describe("sortArchetypesByPath (C11)", () => {
  it("rotates the bucket order with the picked Path (non-mutating)", () => {
    const all = [mage, warrior] // mage=skill, warrior=health
    expect(
      sortArchetypesByPath(all, "health-focused").map((a) => a.key)
    ).toEqual(["warrior", "mage"])
    expect(
      sortArchetypesByPath(all, "skill-focused").map((a) => a.key)
    ).toEqual(["mage", "warrior"])
    expect(all.map((a) => a.key)).toEqual(["mage", "warrior"]) // unmutated
  })
})

describe("previewArchetypeSkills (C7 — synthetic Rank-2 single archetype)", () => {
  it("resolves concrete Skill costs/Attack Rolls at the Origin auto-rank", () => {
    const { ranks, synthesis } = previewArchetypeSkills(data)(
      warrior,
      "balanced"
    )
    expect(ranks.map((r) => r.skill.key)).toEqual([
      "cleave",
      "tempest-slash",
      "slash-boost",
    ])
    expect(ranks[0]!.resolvedCost).toEqual({ kind: "sp", amount: 5 })
    expect(ranks[0]!.resolvedAttackRoll?.total).toBe(3) // strength 3
    expect(synthesis?.skill.key).toBe("peerless")
  })
})

describe("inheritanceSourceGroups (D2 — over the resolved entries)", () => {
  it("groups every OTHER unlocked Archetype's in-rank Skills, dropping empty sources", () => {
    const entries = buildArchetypeEntries(data)(
      resolvedPC(
        [
          { key: "warrior", rank: 3 },
          { key: "mage", rank: 1 },
        ],
        "warrior"
      )
    )
    const groups = inheritanceSourceGroups(entries, "warrior")
    // only mage (the non-owner); its fireball@1 is unlocked at rank 1
    expect(groups.map((g) => g.sourceArchetypeKey)).toEqual(["mage"])
    expect(groups[0]!.skills.map((s) => s.skill.key)).toEqual(["fireball"])
  })

  it("drops over-rank Skills from a source group", () => {
    // warrior at rank 1: cleave@1 in, tempest-slash@3 + slash-boost@5 out
    const entries = buildArchetypeEntries(data)(
      resolvedPC(
        [
          { key: "warrior", rank: 1 },
          { key: "mage", rank: 1 },
        ],
        "mage"
      )
    )
    const groups = inheritanceSourceGroups(entries, "mage")
    expect(groups[0]!.sourceArchetypeKey).toBe("warrior")
    expect(groups[0]!.skills.map((s) => s.skill.key)).toEqual(["cleave"])
  })
})
