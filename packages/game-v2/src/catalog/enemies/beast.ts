import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const wolf = defineEnemy({
  key: "wolf",
  level: 2,
  name: "Wolf",
  maxHP: 21,
  attributes: { strength: 1, magic: -1, agility: 2, luck: -1 },
  affinities: { fire: "weak", ice: "resist" },
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
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
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
  ],
  talents: ["sense", "sneak"],
})

export const BEAST_ENEMIES = {
  wolf,
} as const satisfies Record<string, Entity>
