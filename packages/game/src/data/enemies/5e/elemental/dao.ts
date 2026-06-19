import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const dao = {
  key: "dao",
  level: 5,
  name: "Dao",
  maxHP: 40,
  attributes: { strength: 2, magic: 2, agility: 2, luck: 1 },
  affinities: {
    strike: "null",
    fire: "drain",
    ice: "weak",
  },
  skillKeys: ["agi"],
  inlineSkills: [
    {
      kind: "attack",
      key: "dao-maul",
      name: "Maul",
      tagline: "The Dao smashes at an enemy with their maul.",
      description: "The Dao smashes at their enemy with their maul.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "strike",
      delivery: "physical",
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1d6 + St", sideEffects: [] },
          { band: "11-19", formula: "1d10 + St", sideEffects: [] },
          { band: "20+", formula: "1d10 + St", sideEffects: ["critical"] },
        ],
      },
    },
  ] satisfies Skill[],
  talents: [],
} satisfies EnemyDefinition
