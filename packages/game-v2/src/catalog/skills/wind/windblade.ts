import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const windblade = {
  kind: "attack",
  key: "windblade",
  name: "Windblade",
  tagline: "Weak physical Wind vs. one enemy. Dizzy on a 20+.",
  description: "Deals weak **Wind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "wind", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("st")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("st")],
        sideEffects: ["dizzy"],
      },
    ],
  },
  effect:
    "**(Warrior Only)** If your **Perfection** is B, Range becomes **All Engaged**.",
} satisfies Skill
