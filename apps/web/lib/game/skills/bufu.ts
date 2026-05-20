import type { Skill } from "./schema"

export const bufu = {
  kind: "attack",
  key: "bufu",
  name: "Bufu",
  tagline: "Weak Ice magic vs. one enemy. Freezes on a 20+.",
  description: "Deals weak **Ice** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "ice",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["Freeze"] },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Ice Stain**. Consumes 1 **Elec Stain** to deal an extra `1d4` **Ice** damage.",
} satisfies Skill
