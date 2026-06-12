import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const bugbear = {
  key: "bugbear",
  level: 4,
  name: "Bugbear",
  maxHP: 35,
  attributes: { strength: 2, magic: -1, agility: 1, luck: 0 },
  affinities: { slash: "resist", elec: "resist", light: "weak" },
  skillKeys: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "bugbear-morningstar",
      name: "Morningstar",
      tagline: "The Bugbear smashes its Morningstar at an enemy.",
      description: "The Bugbear smashes its Morningstar at an enemy.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1d4 + St", sideEffects: [] },
          { band: "11-19", formula: "1d8 + St", sideEffects: [] },
          { band: "20+", formula: "1d8 + St", sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "attack",
      key: "bugbear-javelin",
      name: "Javelin",
      tagline: "The Bugbear throws a javelin at a target within range.",
      description: "The Bugbear throws a javelin at a target within range.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: "1 + Ag", sideEffects: [] },
          { band: "11-19", formula: "1d6 + Ag", sideEffects: [] },
          { band: "20+", formula: "1d6 + Ag", sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "passive",
      key: "bugbear-surprise-attack",
      name: "Surprise Attack",
      tagline: "Deals an extra 1d8 damage during an Ambush round.",
      description:
        "During an Ambush round, weapons and Skills deal an additional `1d8` damage.",
      isSynthesis: false,
    },
  ] satisfies Skill[],
  talents: ["sneak"],
} satisfies EnemyDefinition
