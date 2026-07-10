import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

import { resolveCreationArchetypeSkills } from "./creation-archetype-skills"

const skills: Skill[] = [
  {
    key: "cleave",
    kind: "attack",
    name: "Cleave",
    tagline: "t",
    description: "d",
    isSynthesis: false,
    cost: { kind: "sp", amount: 5 },
    attackRoll: { attribute: "st", tiers: [] },
    damage: { damageType: "slash", delivery: "physical" },
  },
  {
    key: "peerless",
    kind: "passive",
    name: "Peerless",
    tagline: "t",
    description: "d",
    isSynthesis: true,
  },
]

const warrior: Archetype = {
  key: "warrior",
  name: "Warrior",
  lineage: "warrior",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 0,
  attributes: { strength: 3, magic: 0, agility: 0, luck: 0 },
  affinities: {},
  mastery: { kind: "hp", amount: 0 },
  talents: [],
  skills: [{ rank: 1, skill: "cleave" }],
  synthesisSkill: { rank: 5, skill: "peerless" },
}

const data: GameData = {
  getArchetype: (key) => (key === warrior.key ? warrior : undefined),
  allArchetypes: () => [warrior],
  getItem: () => undefined,
  allItems: () => [],
  getEquippableItem: () => undefined,
  getSkill: (key) => skills.find((skill) => skill.key === key),
  getEnemy: () => undefined,
  startingWeaponForLineage: () => undefined,
}

describe("resolveCreationArchetypeSkills", () => {
  it("resolves concrete Skill costs and rolls at the Origin auto-rank", () => {
    const { ranks, synthesis } = resolveCreationArchetypeSkills(data)(
      warrior,
      "balanced"
    )

    expect(ranks.map((rank) => rank.skill.key)).toEqual(["cleave"])
    expect(ranks[0]!.resolvedCost).toEqual({ kind: "sp", amount: 5 })
    expect(ranks[0]!.resolvedAttackRoll?.total).toBe(3)
    expect(synthesis?.skill.key).toBe("peerless")
  })
})
