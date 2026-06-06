import type { Skill } from "@workspace/game/foundation/skills/schema"

export const psi = {
  kind: "attack",
  key: "psi",
  name: "Psi",
  tagline: "Weak Psy magic vs. one enemy.",
  description: "Deals weak **Psy** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "psy",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: [] },
    ],
  },
} satisfies Skill
