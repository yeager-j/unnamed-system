import { attr, dice } from "@workspace/game-v2/combat/formula"
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
      { band: "1-10", formula: [dice(1, 6), attr("ag")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("ag")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("ag")],
        sideEffects: ["forget"],
      },
    ],
  },
  effect:
    "**(Thief Only)** With 4+ Tells, you can steal one of the target's Skills. Until the end of your next turn, the target cannot use the stolen Skill. While stolen, you can cast it using your own Attributes.",
} satisfies Skill
