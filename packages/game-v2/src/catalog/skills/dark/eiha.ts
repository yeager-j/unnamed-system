import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const eiha = {
  kind: "attack",
  key: "eiha",
  name: "Eiha",
  tagline: "Weak Dark magic vs. one enemy. Insta-Kill on a 20+.",
  description: "Deals weak **Dark** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "dark", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ma")],
        sideEffects: ["insta-kill-dark"],
      },
    ],
  },
} satisfies Skill
