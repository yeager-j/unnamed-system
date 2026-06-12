import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const wolf = {
  key: "wolf",
  level: 2,
  name: "Wolf",
  maxHP: 21,
  attributes: { strength: 1, magic: -1, agility: 2, luck: -1 },
  affinities: { fire: "weak", ice: "resist" },
  skillKeys: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "wolf-bite",
      name: "Bite",
      tagline: "The Wolf bites at an enemy.",
      description: "The Wolf bites at an enemy.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1 + St", sideEffects: [] },
          { band: "11-19", formula: "1d6 + St", sideEffects: [] },
          { band: "20+", formula: "1d6 + St", sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "passive",
      key: "wolf-pack-tactics",
      name: "Pack Tactics",
      tagline:
        "Advantage on physical Attack Rolls when an ally is Engaged with the same target.",
      description:
        "Gains Advantage on physical Attack Rolls if at least one ally is Engaged with the same target as this creature.",
      isSynthesis: false,
    },
  ] satisfies Skill[],
  talents: ["sense", "sneak"],
} satisfies EnemyDefinition
