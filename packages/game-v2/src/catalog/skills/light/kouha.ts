import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const kouha = {
  kind: "attack",
  key: "kouha",
  name: "Kouha",
  tagline: "Weak Light magic vs. one enemy. Insta-Kill on a 20+.",
  description: "Deals weak **Light** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "light", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ma")],
        sideEffects: ["insta-kill-light"],
      },
    ],
  },
} satisfies Skill
