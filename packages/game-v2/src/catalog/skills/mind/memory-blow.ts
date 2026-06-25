import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const memoryBlow = {
  kind: "attack",
  key: "memory-blow",
  name: "Memory Blow",
  tagline: "Weak single-target Mind. Inflicts Forget on a 20+.",
  description: "Deals weak **Mind** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "mind", delivery: "physical" },
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: F["1d6 + Ag"], sideEffects: [] },
      { band: "11-19", formula: F["1d10 + Ag"], sideEffects: [] },
      { band: "20+", formula: F["1d10 + Ag"], sideEffects: ["forget"] },
    ],
  },
  effect:
    "**(Thief Only)** With 4+ Tells, you can steal one of the target's Skills. Until the end of your next turn, the target cannot use the stolen Skill. While stolen, you can cast it using your own Attributes.",
} satisfies Skill
