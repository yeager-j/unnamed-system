import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const dao = defineEnemy({
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
      damage: { damageType: "strike", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1d6 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d10 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d10 + St"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
})

export const ELEMENTAL_ENEMIES = {
  dao,
} as const satisfies Record<string, Entity>
