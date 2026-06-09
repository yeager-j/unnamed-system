import type { Skill } from "@workspace/game/foundation/skills/schema"

export const memoryBlow = {
  kind: "attack",
  key: "memory-blow",
  name: "Memory Blow",
  tagline: "Weak single-target Psy. Inflicts Forget on a 20+.",
  description: "Deals weak **Psy** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damageType: "psy",
  delivery: "physical",
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: "1d6 + Ag", sideEffects: [] },
      { band: "11-19", formula: "1d10 + Ag", sideEffects: [] },
      { band: "20+", formula: "1d10 + Ag", sideEffects: ["forget"] },
    ],
  },
  effect:
    "**(Thief Only)** With 4+ Tells, you can steal one of the target's Skills. Until the end of your next turn, the target cannot use the stolen Skill. While stolen, you can cast it using your own Attributes.",
} satisfies Skill
