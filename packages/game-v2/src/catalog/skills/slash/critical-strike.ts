import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const criticalStrike = {
  kind: "attack",
  key: "critical-strike",
  name: "Critical Strike",
  tagline: "Weak single-target Slash with a high Critical chance (16+).",
  description:
    "A weak **Slash** attack targeting a single enemy with a high chance to **Critical**.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 10 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "slash", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: F["1d4 + St"], sideEffects: [] },
      { band: "11-15", formula: F["1d8 + St"], sideEffects: [] },
      { band: "16+", formula: F["1d8 + St"], sideEffects: ["critical"] },
    ],
  },
  effect:
    "**(Warrior Only)** If you land a **Critical**, your **Perfection** becomes S.",
} satisfies Skill
