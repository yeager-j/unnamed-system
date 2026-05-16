import type { Skill } from "./schema"

export const kouha = {
  kind: "attack",
  key: "kouha",
  name: "Kouha",
  description: "Deals weak light damage to one enemy.",
  archetypeKey: "healer",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "light",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["Insta-Kill (Light)"] },
    ],
  },
} satisfies Skill
