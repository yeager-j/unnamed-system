import { describe, expect, it } from "vitest"

import {
  makeArchetype,
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@/lib/game/__fixtures__"

import { getMechanic } from "../mechanics"
import { ARCHETYPES } from "./registry"
import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  getArchetypeDisplay,
  previewArchetypeSkills,
  sortArchetypesByPath,
} from "./utils"
import { warrior } from "./warrior/warrior"

describe("sortArchetypesByPath", () => {
  const initiates = ARCHETYPES.filter((a) => a.tier === "initiate")

  it("surfaces health-bucket Lineages first under health-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["warrior", "knight", "healer", "warlock", "mage"])
  })

  it("surfaces balanced-bucket Lineages first under balanced", () => {
    const ordered = sortArchetypesByPath(initiates, "balanced").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["healer", "warlock", "warrior", "knight", "mage"])
  })

  it("surfaces skill-bucket Lineages first under skill-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "skill-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["mage", "healer", "warlock", "warrior", "knight"])
  })

  it("does not mutate its input", () => {
    const input = ARCHETYPES.filter((a) => a.tier === "initiate")
    const before = input.map((a) => a.key)
    const returned = sortArchetypesByPath(input, "health-focused")
    expect(input.map((a) => a.key)).toEqual(before)
    expect(returned).not.toBe(input)
  })

  it("breaks ties within a bucket by LINEAGES order, not its reverse", () => {
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["warrior", "knight", "healer", "warlock", "mage"])
    expect(ordered.indexOf("warrior")).toBeLessThan(ordered.indexOf("knight"))
    expect(ordered.indexOf("healer")).toBeLessThan(ordered.indexOf("warlock"))
  })

  it("reorders same-bucket Lineages into LINEAGES order regardless of input order", () => {
    const knight = initiates.find((a) => a.lineage === "knight")!
    const warrior = initiates.find((a) => a.lineage === "warrior")!
    const shuffled = [knight, warrior]
    const ordered = sortArchetypesByPath(shuffled, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["warrior", "knight"])
  })

  it("keeps a bucket's own Lineages ahead of a later bucket even when input is reversed", () => {
    const mage = initiates.find((a) => a.lineage === "mage")!
    const warrior = initiates.find((a) => a.lineage === "warrior")!
    const ordered = sortArchetypesByPath([mage, warrior], "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["warrior", "mage"])
  })
})

describe("previewArchetypeSkills", () => {
  it("returns every rank-keyed Skill the Archetype declares", () => {
    const { ranks } = previewArchetypeSkills(warrior, "balanced")
    expect(ranks).toHaveLength(warrior.skills.length)
    const sortedByRank = [...ranks].sort((a, b) => a.rank - b.rank)
    expect(sortedByRank.map((skill) => skill.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it("resolves percentage-HP costs against the picked path's max HP", () => {
    const { ranks } = previewArchetypeSkills(warrior, "balanced")
    const cleave = ranks.find((ranked) => ranked.key === "cleave")
    expect(cleave?.resolvedCost).toEqual({ kind: "hp", amount: 1 })
  })

  it("re-resolves percentage costs when the path changes", () => {
    const health = previewArchetypeSkills(warrior, "health-focused")
    const skill = previewArchetypeSkills(warrior, "skill-focused")
    expect(health.ranks.find((r) => r.key === "cleave")?.resolvedCost).toEqual({
      kind: "hp",
      amount: 1,
    })
    expect(skill.ranks.find((r) => r.key === "cleave")?.resolvedCost).toEqual({
      kind: "hp",
      amount: 1,
    })
  })

  it("resolves the Attack Roll against the previewed Archetype's intrinsic stats", () => {
    const { ranks } = previewArchetypeSkills(warrior, "balanced")
    const attackSkill = ranks.find(
      (ranked) => ranked.kind === "attack" && ranked.attackRoll
    )
    expect(attackSkill).toBeDefined()
    expect(attackSkill?.resolvedAttackRoll).not.toBeNull()
    expect(attackSkill?.resolvedAttackRoll?.sources[0]).toMatchObject({
      source: expect.any(String),
      amount: expect.any(Number),
    })
  })

  it("resolves the Synthesis Skill alongside the ranked Skills", () => {
    const { synthesis } = previewArchetypeSkills(warrior, "balanced")
    expect(synthesis).toMatchObject({
      key: warrior.synthesisSkill!.skill,
      rank: warrior.synthesisSkill!.rank,
    })
  })

  it("has no synthesis when the Archetype declares none", () => {
    const { synthesis } = previewArchetypeSkills(
      makeArchetype({ synthesisSkill: undefined }),
      "balanced"
    )
    expect(synthesis).toBeNull()
  })
})

describe("buildArchetypeEntries", () => {
  it("builds one entry per resolvable Archetype row", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
      ],
    })
    const entries = buildArchetypeEntries(character)
    expect(entries.map((e) => e.archetype.key)).toEqual(["warrior", "mage"])
  })

  it("skips a row whose archetypeKey no longer resolves to a catalog entry", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "ghost", archetypeKey: "no-such-archetype" }),
      ],
    })
    const entries = buildArchetypeEntries(character)
    expect(entries.map((e) => e.archetype.key)).toEqual(["warrior"])
  })

  it("flags the row matching activeArchetypeId as active and the rest inactive", () => {
    const character = makeHydratedCharacter({
      row: { activeArchetypeId: "b" },
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
      ],
    })
    const entries = buildArchetypeEntries(character)
    expect(entries.find((e) => e.row.id === "a")?.isActive).toBe(false)
    expect(entries.find((e) => e.row.id === "b")?.isActive).toBe(true)
  })

  it("resolves every Rank-keyed Skill the Archetype declares", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    const [entry] = buildArchetypeEntries(character)
    expect(entry!.ranks.map((r) => r.rank).sort()).toEqual(
      [...warrior.skills].map((s) => s.rank).sort()
    )
  })

  it("resolves the Synthesis Skill the Archetype declares", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    const [entry] = buildArchetypeEntries(character)
    expect(entry!.synthesis).toMatchObject({
      key: warrior.synthesisSkill!.skill,
      rank: warrior.synthesisSkill!.rank,
    })
  })

  it("produces one resolved slot per inheritanceSlots entry on the row", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({
          id: "a",
          archetypeKey: "warrior",
          inheritanceSlots: [
            { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
            { slotIndex: 1, sourceCharacterArchetypeId: null, skillKey: null },
          ],
        }),
      ],
    })
    const [entry] = buildArchetypeEntries(character)
    expect(entry!.slots.map((s) => s.slotIndex)).toEqual([0, 1])
  })

  it("treats an empty slot (null skillKey) as valid with no resolved Skill or source", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({
          id: "a",
          archetypeKey: "warrior",
          inheritanceSlots: [
            { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
          ],
        }),
      ],
    })
    const [entry] = buildArchetypeEntries(character)
    expect(entry!.slots[0]).toMatchObject({
      sourceArchetype: null,
      resolved: null,
      isValid: true,
    })
  })

  it("resolves a configured slot to its source Archetype and filling Skill, marking it valid", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({
          id: "owner",
          archetypeKey: "warrior",
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "src",
              skillKey: "skewer",
            },
          ],
        }),
        makeArchetypeRow({ id: "src", archetypeKey: "knight", rank: 5 }),
      ],
    })
    const owner = buildArchetypeEntries(character).find(
      (e) => e.row.id === "owner"
    )!
    expect(owner.slots[0]!.sourceArchetype?.key).toBe("knight")
    expect(owner.slots[0]!.resolved?.key).toBe("skewer")
    expect(owner.slots[0]!.isValid).toBe(true)
  })

  it("marks a configured slot invalid when the source Rank no longer unlocks its Skill", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({
          id: "owner",
          archetypeKey: "warrior",
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "src",
              skillKey: "auto-rakukaja",
            },
          ],
        }),
        makeArchetypeRow({ id: "src", archetypeKey: "knight", rank: 1 }),
      ],
    })
    const owner = buildArchetypeEntries(character).find(
      (e) => e.row.id === "owner"
    )!
    expect(owner.slots[0]!.isValid).toBe(false)
  })

  it("marks a configured slot invalid when its source row no longer exists", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({
          id: "owner",
          archetypeKey: "warrior",
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "missing-src",
              skillKey: "skewer",
            },
          ],
        }),
      ],
    })
    const [owner] = buildArchetypeEntries(character)
    expect(owner!.slots[0]!.sourceArchetype).toBeNull()
    expect(owner!.slots[0]!.isValid).toBe(false)
  })

  it("leaves a configured slot's resolved Skill null when its skillKey no longer resolves", () => {
    const character = makeHydratedCharacter({
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
    const owner = buildArchetypeEntries(character).find(
      (e) => e.row.id === "owner"
    )!
    expect(owner.slots[0]!.resolved).toBeNull()
    expect(owner.slots[0]!.isValid).toBe(false)
  })
})

describe("getArchetypeDisplay", () => {
  it("returns the active Archetype entry as the spotlight", () => {
    const character = makeHydratedCharacter({
      row: { activeArchetypeId: "b" },
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
      ],
    })
    expect(getArchetypeDisplay(character).activeEntry?.row.id).toBe("b")
  })

  it("returns a null spotlight when no row is active", () => {
    const character = makeHydratedCharacter({
      row: { activeArchetypeId: null },
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    expect(getArchetypeDisplay(character).activeEntry).toBeNull()
  })
})

describe("archetypeSwitcherGroups", () => {
  it("groups unlocked Archetypes by Lineage", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "b", archetypeKey: "mage" }),
      ],
    })
    const groups = archetypeSwitcherGroups(character)
    expect(groups.map((g) => g.lineage)).toEqual(["warrior", "mage"])
    expect(groups[0]!.options.map((o) => o.id)).toEqual(["a"])
    expect(groups[1]!.options.map((o) => o.id)).toEqual(["b"])
  })

  it("skips a row whose archetypeKey no longer resolves", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "ghost", archetypeKey: "no-such-archetype" }),
      ],
    })
    const groups = archetypeSwitcherGroups(character)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.options.map((o) => o.id)).toEqual(["a"])
  })

  it("orders groups by the canonical LINEAGES order regardless of row order", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "w", archetypeKey: "warlock" }),
        makeArchetypeRow({ id: "k", archetypeKey: "knight" }),
        makeArchetypeRow({ id: "m", archetypeKey: "mage" }),
      ],
    })
    const groups = archetypeSwitcherGroups(character)
    expect(groups.map((g) => g.lineage)).toEqual(["mage", "knight", "warlock"])
  })

  it("carries each option's id, name, tier, and current rank", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "a", archetypeKey: "warrior", rank: 3 }),
      ],
    })
    const [group] = archetypeSwitcherGroups(character)
    expect(group!.options[0]).toMatchObject({
      id: "a",
      name: warrior.name,
      tier: warrior.tier,
      rank: 3,
    })
  })

  it("keeps every unlocked row of one Lineage in that Lineage's single group", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [
        makeArchetypeRow({ id: "w1", archetypeKey: "warrior", rank: 1 }),
        makeArchetypeRow({ id: "w2", archetypeKey: "warrior", rank: 4 }),
      ],
    })
    const groups = archetypeSwitcherGroups(character)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.lineage).toBe("warrior")
    expect(groups[0]!.options.map((o) => o.id).sort()).toEqual(["w1", "w2"])
  })

  it("resolves the Archetype's Mechanic display name", () => {
    const character = makeHydratedCharacter({
      archetypeRows: [makeArchetypeRow({ id: "a", archetypeKey: "warrior" })],
    })
    const [group] = archetypeSwitcherGroups(character)
    expect(group!.options[0]!.mechanicName).toBe(
      getMechanic(warrior.mechanic!)!.displayName
    )
    expect(group!.options[0]!.mechanicName).not.toBeNull()
  })
})
