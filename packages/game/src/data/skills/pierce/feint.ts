import type { Skill } from "@workspace/game/foundation/skills/schema"

export const feint = {
  kind: "attack",
  key: "feint",
  name: "Feint",
  tagline: "Weak single-target Pierce that builds Tells. Crits on a 20+.",
  description: "You misdirect an enemy and then stab them from a blind angle.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 10 },
  range: { kind: "known", value: "engaged" },
  damageType: "pierce",
  delivery: "physical",
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: "1d4 + Ag", sideEffects: [] },
      { band: "11-19", formula: "1d8 + Ag", sideEffects: [] },
      { band: "20+", formula: "1d8 + Ag", sideEffects: ["critical"] },
    ],
  },
  effect: "**(Thief Only)** `11-19`: +1 Tell; `20+`: +2 Tells.",
} satisfies Skill
