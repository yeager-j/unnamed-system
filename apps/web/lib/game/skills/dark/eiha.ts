import type { Skill } from "../schema"

export const eiha = {
  kind: "attack",
  key: "eiha",
  name: "Eiha",
  tagline: "Weak Dark magic vs. one enemy. Insta-Kill on a 20+.",
  description: "Deals weak **Dark** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "dark",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["insta-kill-dark"] },
    ],
  },
} satisfies Skill
