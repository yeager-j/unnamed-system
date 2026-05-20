import type { Skill } from "./schema"

export const garu = {
  kind: "attack",
  key: "garu",
  name: "Garu",
  tagline: "Weak Wind magic vs. one enemy. Dizzy on a 20+.",
  description: "Deals weak **Wind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "wind",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["Dizzy"] },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Wind Stain**. Consumes 1 **Fire Stain** to deal an extra `1d4` **Wind** damage.",
} satisfies Skill
