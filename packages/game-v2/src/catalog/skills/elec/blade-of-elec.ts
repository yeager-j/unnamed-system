import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const bladeOfElec = {
  kind: "attack",
  key: "blade-of-elec",
  name: "Blade of Elec",
  tagline: "Weak physical Elec vs. one enemy. Shock on a 20+.",
  description: "Deals weak **Elec** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "elec", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: F["1d6 + St"], sideEffects: [] },
      { band: "11-19", formula: F["1d10 + St"], sideEffects: [] },
      {
        band: "20+",
        formula: F["1d10 + St"],
        sideEffects: ["shock", "critical"],
      },
    ],
  },
  effect:
    "**(Elemental Thief Only)** On a Weakness, gain 1 Tell. On a Technical, gain 2 Tells.",
} satisfies Skill
