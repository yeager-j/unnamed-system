import { describe, expect, it } from "vitest"

import { previewArchetypeSkills } from "./preview"
import { warrior } from "./warrior"

describe("previewArchetypeSkills", () => {
  it("returns every rank-keyed Skill the Archetype declares", () => {
    const { ranks } = previewArchetypeSkills(warrior, "balanced")
    expect(ranks).toHaveLength(warrior.skills.length)
    const sortedByRank = [...ranks].sort((a, b) => a.rank - b.rank)
    expect(sortedByRank.map((skill) => skill.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it("resolves percentage-HP costs against the picked path's max HP", () => {
    // Cleave (Warrior, Rank 1) costs 5% HP. At Level 1 on Balanced the
    // character has 20 max HP, so the cost resolves to floor(20 * 5 / 100) = 1.
    const { ranks } = previewArchetypeSkills(warrior, "balanced")
    const cleave = ranks.find((ranked) => ranked.key === "cleave")
    expect(cleave?.resolvedCost).toEqual({ kind: "hp", amount: 1 })
  })

  it("re-resolves percentage costs when the path changes", () => {
    // Cleave (5% HP) at Level 1 — both Health-Focused (24 max HP) and
    // Skill-Focused (16 max HP) floor to 1 HP under the engine's
    // always-charge-at-least-1 rule.
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
