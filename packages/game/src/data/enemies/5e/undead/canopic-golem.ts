import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const canopicGolem = {
  key: "canopic-golem",
  level: 6,
  name: "Canopic Golem",
  maxHP: 84,
  attributes: { strength: 3, magic: 1, agility: 1, luck: 1 },
  affinities: {
    fire: "repel",
    ice: "repel",
    elec: "repel",
    wind: "repel",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  talents: ["demolish"],
  inlineSkills: [
    {
      kind: "attack",
      key: "canopic-golem-slam",
      name: "Slam",
      tagline: "The Canopic Golem slams its fist into a target twice.",
      description: "The Canopic Golem slams its fist into a target twice.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "strike",
      delivery: "physical",
      hits: 2,
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1d6 + St", sideEffects: [] },
          { band: "11-19", formula: "1d10 + St", sideEffects: [] },
          { band: "20+", formula: "1d10 + St", sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "attack",
      key: "canopic-golem-dart",
      name: "Crystal Dart",
      tagline: "The Canopic Golem throws a crystal dart at a target.",
      description: "The Canopic Golem throws a crystal dart at a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damageType: "pierce",
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
  ],
} satisfies EnemyDefinition
