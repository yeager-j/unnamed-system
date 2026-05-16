import type { Skill } from "./schema"

export const criticalStrike = {
  kind: "attack",
  key: "critical-strike",
  name: "Critical Strike",
  description:
    "A weak slashing attack targeting a single enemy with a high chance to crit.",
  archetypeKey: "warrior",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 10 },
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d4 + St", sideEffects: [] },
      { band: "11-15", formula: "1d8 + St", sideEffects: [] },
      { band: "16+", formula: "1d8 + St", sideEffects: ["Critical"] },
    ],
  },
  effect: "(Warrior Only) If you land a Critical, your Perfection becomes S.",
} satisfies Skill
