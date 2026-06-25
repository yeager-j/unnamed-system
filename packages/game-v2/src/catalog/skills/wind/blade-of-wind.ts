import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const bladeOfWind = {
  kind: "attack",
  key: "blade-of-wind",
  name: "Blade of Wind",
  tagline: "Weak physical Wind vs. one enemy. Dizzy on a 20+.",
  description: "Deals weak **Wind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "wind", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: F["1d6 + St"], sideEffects: [] },
      { band: "11-19", formula: F["1d10 + St"], sideEffects: [] },
      {
        band: "20+",
        formula: F["1d10 + St"],
        sideEffects: ["dizzy", "critical"],
      },
    ],
  },
  effect:
    "**(Elemental Thief Only)** On a Weakness, gain 1 Tell. On a Technical, gain 2 Tells.",
} satisfies Skill
