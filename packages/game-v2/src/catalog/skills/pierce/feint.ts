import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const feint = {
  kind: "attack",
  key: "feint",
  name: "Feint",
  tagline: "Weak single-target Pierce that builds Tells. Crits on a 20+.",
  description: "You misdirect an enemy and then stab them from a blind angle.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 10 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "pierce", delivery: "physical" },
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ag")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ag")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ag")],
        sideEffects: ["critical"],
      },
    ],
  },
  effect: "**(Thief Only)** `11-19`: +1 Tell; `20+`: +2 Tells.",
} satisfies Skill
