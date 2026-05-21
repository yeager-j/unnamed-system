import type { Skill } from "./schema"

export const stormThrust = {
  kind: "attack",
  key: "storm-thrust",
  name: "Storm Thrust",
  tagline: "Weak physical Elec vs. one enemy. Shocks on a 20+.",
  description: "Deals weak **Elec** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damageType: "elec",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["shock"] },
    ],
  },
  effect:
    "**(Knight Only)** If you **Down** an enemy due to hitting its **Weakness**, you gain 1 **Valor**.",
} satisfies Skill
