import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const valinSarnaster = {
  key: "valin-sarnaster",
  level: 6,
  name: "Valin Sarnaster",
  maxHP: 96,
  attributes: { strength: 3, magic: 3, agility: 1, luck: 2 },
  affinities: {
    dark: "drain",
    slash: "null",
    pierce: "null",
    strike: "null",
    fire: "weak",
  },
  skillKeys: ["psi", "eiha", "evil-touch"],
  talents: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "rotting-fist",
      name: "Rotting Fist",
      tagline: "Valin Sarnaster throws a rotting fist at a target.",
      description: "Valin Sarnaster throws a rotting fist at a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "dark",
      delivery: "physical",
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1d8 + St", sideEffects: [] },
          { band: "11-19", formula: "1d12 + St", sideEffects: [] },
          {
            band: "20+",
            formula: "1d12 + St",
            sideEffects: ["critical", "despair"],
          },
        ],
      },
    },
    {
      kind: "ailment",
      key: "dreadful-glare",
      name: "Dreadful Glade",
      tagline: "Valin Sarnaster glares at a target with her dark glare.",
      description: "Valin Sarnaster glares at a target with her dark glare.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      targets: "All",
      attackRoll: {
        attribute: "ma",
        tiers: [
          { band: "1-10", sideEffects: [] },
          { band: "11-19", sideEffects: ["fear"] },
          {
            band: "20+",
            sideEffects: ["fear", "confuse"],
          },
        ],
      },
    },
  ],
} satisfies EnemyDefinition
