import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const garu = {
  kind: "attack",
  key: "garu",
  name: "Garu",
  tagline: "Weak Wind magic vs. one enemy. Dizzy on a 20+.",
  description: "Deals weak **Wind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "wind", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ma")],
        sideEffects: ["dizzy"],
      },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Wind Stain**. Consumes 1 **Fire Stain** to deal an extra `1d4` **Wind** damage.",
} satisfies Skill
