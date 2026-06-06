import type { Skill } from "@workspace/game/foundation/skills/schema"

export const agi = {
  kind: "attack",
  key: "agi",
  name: "Agi",
  tagline: "Weak Fire magic vs. one enemy. Burns on a 20+.",
  description: "Deals weak **Fire** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "fire",
  delivery: "magical",
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: "1d4 + Ma", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ma", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ma", sideEffects: ["burn"] },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Fire Stain**. Consumes 1 **Ice Stain** to deal an extra `1d4` **Fire** damage.",
} satisfies Skill
