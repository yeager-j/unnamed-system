import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const bufu = {
  kind: "attack",
  key: "bufu",
  name: "Bufu",
  tagline: "Weak Ice magic vs. one enemy. Freezes on a 20+.",
  description: "Deals weak **Ice** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "ice", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ma")],
        sideEffects: ["freeze"],
      },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Ice Stain**. Consumes 1 **Elec Stain** to deal an extra `1d4` **Ice** damage.",
} satisfies Skill
