import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const psi = {
  kind: "attack",
  key: "psi",
  name: "Psi",
  tagline: "Weak Mind magic vs. one enemy.",
  description: "Deals weak **Mind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "mind", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      { band: "20+", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
    ],
  },
} satisfies Skill
