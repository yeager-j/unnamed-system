import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const mummy = {
  key: "mummy",
  level: 3,
  name: "Mummy",
  maxHP: 40,
  attributes: { strength: 2, magic: 0, agility: 1, luck: 0 },
  affinities: {
    fire: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  talents: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "mummy-slam",
      name: "Slam",
      tagline: "The Mummy slams its fist into a target.",
      description: "The Mummy slams its fist into a target.",
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
