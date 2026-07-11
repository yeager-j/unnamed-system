import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const bladeOfIce = {
  kind: "attack",
  key: "blade-of-ice",
  name: "Blade of Ice",
  tagline: "Weak physical Ice vs. one enemy. Freeze on a 20+.",
  description: "Deals weak **Ice** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "ice", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("st")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("st")],
        sideEffects: ["freeze", "critical"],
      },
    ],
  },
  effect:
    "**(Elemental Thief Only)** On a Weakness, gain 1 Tell. On a Technical, gain 2 Tells.",
} satisfies Skill
