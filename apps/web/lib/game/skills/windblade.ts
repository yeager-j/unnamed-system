import type { Skill } from "./schema"

export const windblade = {
  kind: "attack",
  key: "windblade",
  name: "Windblade",
  tagline: "Weak physical Wind vs. one enemy. Dizzy on a 20+.",
  description: "Deals weak **Wind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damageType: "wind",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["Dizzy"] },
    ],
  },
  effect:
    "**(Warrior Only)** If your **Perfection** is B, Range becomes **All Engaged**.",
} satisfies Skill
