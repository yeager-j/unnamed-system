import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  activeArchetypeSkills,
  inheritedSkills,
} from "@workspace/game-v2/archetypes/skills"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "passive",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

const SKILLS: Record<string, Skill> = {
  "passive-str": skill({ key: "passive-str", kind: "passive" }),
  "passive-mag": skill({ key: "passive-mag", kind: "passive" }),
  "active-str": skill({
    key: "active-str",
    kind: "attack",
    cost: { kind: "sp", amount: 1 },
  }),
  synthesis: skill({ key: "synthesis", kind: "attack", isSynthesis: true }),
}

const warrior: Archetype = {
  attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
  affinities: {},
  mastery: { kind: "hp", amount: 0 },
  lineage: "warrior",
  key: "warrior",
  name: "Warrior",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 0,
  talents: [],
  skills: [
    { rank: 1, skill: "passive-str" }, // unlocked at rank 3
    { rank: 1, skill: "active-str" }, // unlocked — active skills collected too
    { rank: 5, skill: "passive-mag" }, // above rank 3 ⇒ locked
  ],
  synthesisSkill: { rank: 5, skill: "synthesis" },
}

const deps: Pick<GameData, "getArchetype" | "getSkill"> = {
  getArchetype: (key) => (key === "warrior" ? warrior : undefined),
  getSkill: (key) => SKILLS[key],
}

function pc(
  active: string | null,
  rank = 3,
  slots: Array<{ skillKey: string | null }> = []
): Entity {
  return {
    id: "pc",
    components: {
      archetypes: {
        active,
        origin: active,
        savedArchetypeRanks: 0,
        roster: [
          {
            key: "warrior",
            rank,
            inheritanceSlots: slots.map((s, i) => ({
              slotIndex: i,
              sourceArchetypeKey: "mage",
              skillKey: s.skillKey,
            })),
          },
        ],
      },
    },
  }
}

describe("activeArchetypeSkills (the active archetype's unlocked kit, by rank)", () => {
  it("collects every unlocked Skill — active AND passive — gated by rank", () => {
    // rank 3: passive-str + active-str (both rank 1) in; passive-mag + synthesis
    // (rank 5) locked out.
    expect(
      activeArchetypeSkills(deps, pc("warrior")).map((s) => s.key)
    ).toEqual(["passive-str", "active-str"])
  })

  it("includes the Synthesis Skill once its rank unlocks", () => {
    expect(
      activeArchetypeSkills(deps, pc("warrior", 5)).map((s) => s.key)
    ).toEqual(["passive-str", "active-str", "passive-mag", "synthesis"])
  })

  it("is empty when no Archetype is active (suppressed under a form)", () => {
    expect(activeArchetypeSkills(deps, pc(null))).toEqual([])
  })

  it("drops references whose Skill key no longer resolves", () => {
    const ghost: Archetype = {
      ...warrior,
      skills: [{ rank: 1, skill: "missing" }],
      synthesisSkill: undefined,
    }
    const ghostDeps: Pick<GameData, "getArchetype" | "getSkill"> = {
      getArchetype: () => ghost,
      getSkill: (key) => SKILLS[key],
    }
    expect(activeArchetypeSkills(ghostDeps, pc("warrior"))).toEqual([])
  })
})

describe("inheritedSkills (the ACTIVE archetype's slots only)", () => {
  it("collects filled slots' Skills — active and passive; skips empty slots", () => {
    const entity = pc("warrior", 3, [
      { skillKey: "passive-mag" },
      { skillKey: null }, // empty ⇒ skipped
      { skillKey: "active-str" }, // active inherited skills collect too
    ])
    expect(inheritedSkills(deps, entity).map((s) => s.key)).toEqual([
      "passive-mag",
      "active-str",
    ])
  })

  it("ignores an INACTIVE archetype's inheritance slots (applies only while active)", () => {
    const entity: Entity = {
      id: "pc",
      components: {
        archetypes: {
          active: null,
          origin: "warrior",
          savedArchetypeRanks: 0,
          roster: [
            {
              key: "warrior",
              rank: 3,
              inheritanceSlots: [
                {
                  slotIndex: 0,
                  sourceArchetypeKey: "mage",
                  skillKey: "passive-mag",
                },
              ],
            },
          ],
        },
      },
    }
    expect(inheritedSkills(deps, entity)).toEqual([])
  })
})
