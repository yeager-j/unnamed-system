import { F } from "@workspace/game-v2/catalog/skills/formulas"
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
      { band: "1-10", formula: F["1d4 + Ma"], sideEffects: [] },
      { band: "11-19", formula: F["1d8 + Ma"], sideEffects: [] },
      {
        band: "20+",
        formula: F["1d8 + Ma"],
        sideEffects: ["insta-kill-light"],
      },
    ],
  },
} satisfies Skill
