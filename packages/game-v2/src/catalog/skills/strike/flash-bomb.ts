import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const flashBomb = {
  kind: "attack",
  key: "flash-bomb",
  name: "Flash Bomb",
  tagline: "Weak Strike vs. multiple enemies in a Zone. Crits on a 20+.",
  description: "Deals weak **Strike** damage to multiple targets.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 6 },
  range: { kind: "known", value: "same-zone" },
  damage: { damageType: "strike", delivery: "physical" },
  targets: "2 (+1 Reckless)",
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
      { band: "11-19", formula: F["1d4 + Ag"], sideEffects: [] },
      { band: "20+", formula: F["1d4 + Ag"], sideEffects: ["critical"] },
    ],
  },
  effect:
    "**(Thief Only)** You learn 1 Tell from each enemy Downed by this damage.",
} satisfies Skill
