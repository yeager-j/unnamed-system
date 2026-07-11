import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const agi = {
  kind: "attack",
  key: "agi",
  name: "Agi",
  tagline: "Weak Fire magic vs. one enemy. Burns on a 20+.",
  description: "Deals weak **Fire** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "fire", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      { band: "20+", formula: [dice(1, 8), attr("ma")], sideEffects: ["burn"] },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Fire Stain**. Consumes 1 **Ice Stain** to deal an extra `1d4` **Fire** damage.",
} satisfies Skill
