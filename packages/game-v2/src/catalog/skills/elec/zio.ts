import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const zio = {
  kind: "attack",
  key: "zio",
  name: "Zio",
  tagline: "Weak Elec magic vs. one enemy. Shocks on a 20+.",
  description: "Deals weak **Elec** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "elec", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 8), attr("ma")],
        sideEffects: ["shock"],
      },
    ],
  },
  effect:
    "**(Mage Only)** Produces 1 **Elec Stain**. Consumes 1 **Wind Stain** to deal an extra `1d4` **Elec** damage.",
} satisfies Skill
