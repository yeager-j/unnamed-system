import type { Skill } from "@workspace/game/foundation/skills/schema"

export const bladeOfIce = {
  kind: "attack",
  key: "blade-of-ice",
  name: "Blade of Ice",
  tagline: "Weak physical Ice vs. one enemy. Freeze on a 20+.",
  description: "Deals weak **Ice** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damageType: "ice",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["freeze"] },
    ],
  },
  effect:
    "**(Elemental Thief Only)** On a Weakness, gain 1 Tell. On a Technical, gain 2 Tells.",
} satisfies Skill
