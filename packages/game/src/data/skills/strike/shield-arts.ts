import type { Skill } from "@workspace/game/foundation/skills/schema"

export const shieldArts = {
  kind: "attack",
  key: "shield-arts",
  name: "Shield Arts",
  tagline: "Weak Strike vs. one enemy; may apply Sukunda for 3 turns.",
  description:
    "Deals weak physical **Strike** damage to one enemy. Potentially decreases their Hit/Evasion for 3 turns.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 15 },
  range: { kind: "known", value: "engaged" },
  damageType: "strike",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d4 + St", sideEffects: [] },
      { band: "11-19", formula: "1d8 + St", sideEffects: ["sukunda"] },
      {
        band: "20+",
        formula: "1d8 + St",
        sideEffects: ["sukunda", "critical"],
      },
    ],
  },
  effect:
    "**(Knight Only)** Before making your Attack Roll, you can spend 3 **Valor** to change this Skill's Range to **All Engaged** for this turn.",
} satisfies Skill
