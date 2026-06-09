import type { Skill } from "@workspace/game/foundation/skills/schema"

export const flashBomb = {
  kind: "attack",
  key: "flash-bomb",
  name: "Flash Bomb",
  tagline: "Weak Strike vs. multiple enemies in a Zone. Crits on a 20+.",
  description: "Deals weak **Strike** damage to multiple targets.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 6 },
  range: { kind: "known", value: "same-zone" },
  damageType: "strike",
  delivery: "physical",
  targets: "2 (+1 Reckless)",
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: "1 + Ag", sideEffects: [] },
      { band: "11-19", formula: "1d4 + Ag", sideEffects: [] },
      { band: "20+", formula: "1d4 + Ag", sideEffects: ["critical"] },
    ],
  },
  effect:
    "**(Thief Only)** You learn 1 Tell from each enemy Downed by this damage.",
} satisfies Skill
