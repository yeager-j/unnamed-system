import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const skewer = {
  kind: "attack",
  key: "skewer",
  name: "Skewer",
  tagline: "Weak single-target Pierce. Crits on a 20+.",
  description: "A weak **Pierce** attack targeting a single enemy.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 5 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "pierce", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: F["1d6 + St"], sideEffects: [] },
      { band: "11-19", formula: F["1d10 + St"], sideEffects: [] },
      { band: "20+", formula: F["1d10 + St"], sideEffects: ["critical"] },
    ],
  },
  effect:
    "**(Knight Only)** You can spend 2 **Valor** to turn **Critical** into **Auto-Critical**. You can choose to spend the **Valor** after seeing the result of your Attack Roll, but you must do so before the DM determines if the **Critical** lands.",
} satisfies Skill
