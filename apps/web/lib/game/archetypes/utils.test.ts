import { describe, expect, it } from "vitest"

import { ARCHETYPES } from "./registry"
import { previewArchetypeSkills, sortArchetypesByPath } from "./utils"
import { warrior } from "./warrior/warrior"

describe("sortArchetypesByPath", () => {
  const initiates = ARCHETYPES.filter((a) => a.tier === "initiate")

  it("surfaces health-bucket Lineages first under health-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["warrior", "knight", "healer", "mage"])
  })

  it("surfaces balanced-bucket Lineages first under balanced", () => {
    const ordered = sortArchetypesByPath(initiates, "balanced").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["healer", "warrior", "knight", "mage"])
  })

  it("surfaces skill-bucket Lineages first under skill-focused", () => {
    const ordered = sortArchetypesByPath(initiates, "skill-focused").map(
      (a) => a.lineage
    )
    expect(ordered).toEqual(["mage", "healer", "warrior", "knight"])
  })

  it("does not mutate its input", () => {
    const before = initiates.map((a) => a.key)
    sortArchetypesByPath(initiates, "skill-focused")
    expect(initiates.map((a) => a.key)).toEqual(before)
  })

  it("breaks ties within a bucket by LINEAGES order", () => {
    const ordered = sortArchetypesByPath(initiates, "health-focused").map(
      (a) => a.lineage
    )
    expect(ordered.indexOf("warrior")).toBeLessThan(ordered.indexOf("knight"))
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
})
