import type { Skill } from "../schema"

export const cleave = {
  kind: "attack",
  key: "cleave",
  name: "Cleave",
  tagline: "Weak single-target Slash. Crits on a 20+.",
  description: "A weak **Slash** attack targeting a single enemy.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 5 },
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["critical"] },
    ],
  },
  effect:
    "**(Warrior Only)** If your **Perfection** is D and the enemy takes damage, your **Perfection** increases by 1 additional rank.",
} satisfies Skill
