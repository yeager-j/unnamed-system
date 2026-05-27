import type { Skill } from "../schema"

export const zio = {
  kind: "attack",
  key: "zio",
  name: "Zio",
  tagline: "Weak Elec magic vs. one enemy. Shocks on a 20+.",
  description: "Deals weak **Elec** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "elec",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["shock"] },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Elec Stain**. Consumes 1 **Wind Stain** to deal an extra `1d4` **Elec** damage.",
} satisfies Skill
