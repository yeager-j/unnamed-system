import { F } from "@workspace/game-v2/catalog/skills/formulas"
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
      { band: "1-10", formula: F["1d4 + Ma"], sideEffects: [] },
      { band: "11-19", formula: F["1d8 + Ma"], sideEffects: [] },
      {
        band: "20+",
        formula: F["1d8 + Ma"],
        sideEffects: ["insta-kill-dark"],
      },
    ],
  },
} satisfies Skill
