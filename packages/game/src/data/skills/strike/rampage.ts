import type { Skill } from "@workspace/game/foundation/skills/schema"

export const rampage = {
  kind: "attack",
  key: "rampage",
  name: "Rampage",
  tagline: "Weak single-target Strike that hits twice. Crits on a 20+.",
  description: "A weak **Strike** attack targeting a single enemy. Hits twice.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 15 },
  range: { kind: "known", value: "engaged" },
  damageType: "strike",
  delivery: "physical",
  hits: 2,
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1 + St", sideEffects: [] },
      { band: "11-19", formula: "1d4 + St", sideEffects: [] },
      { band: "20+", formula: "1d4 + St", sideEffects: ["critical"] },
    ],
  },
  effect: "**(Berserker/Frenzy Mode)** Range becomes **All Engaged**.",
} satisfies Skill
