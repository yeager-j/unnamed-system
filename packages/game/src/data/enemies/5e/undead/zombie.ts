import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const zombie = {
  key: "zombie",
  level: 2,
  name: "Zombie",
  maxHP: 30,
  attributes: { strength: 1, magic: -1, agility: 0, luck: 0 },
  affinities: {
    slash: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  talents: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "zombie-slam",
      name: "Slam",
      tagline: "The Zombie slams its fist into a target.",
      description: "The Zombie slams its fist into a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "strike",
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
  ],
} satisfies EnemyDefinition
