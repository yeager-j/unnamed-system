import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const rampage = {
  kind: "attack",
  key: "rampage",
  name: "Rampage",
  tagline: "Weak single-target Strike that hits twice. Crits on a 20+.",
  description: "A weak **Strike** attack targeting a single enemy. Hits twice.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 15 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "strike", delivery: "physical", hits: 2 },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: F["1 + St"], sideEffects: [] },
      { band: "11-19", formula: F["1d4 + St"], sideEffects: [] },
      { band: "20+", formula: F["1d4 + St"], sideEffects: ["critical"] },
    ],
  },
  effect: "**(Berserker/Frenzy Mode)** Range becomes **All Engaged**.",
} satisfies Skill
