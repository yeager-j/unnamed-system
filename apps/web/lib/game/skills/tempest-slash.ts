import type { Skill } from "./schema"

export const tempestSlash = {
  kind: "attack",
  key: "tempest-slash",
  name: "Tempest Slash",
  tagline: "Three Slash hits on one enemy. Crits on a 20+.",
  description: "A series of **Slash** attacks targeting one enemy.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 15 },
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  hits: 3,
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1 + St", sideEffects: [] },
      { band: "11-19", formula: "1d4 + St", sideEffects: [] },
      { band: "20+", formula: "1d4 + St", sideEffects: ["Critical"] },
    ],
  },
  effect:
    "**(Warrior Only)** If your **Perfection** is S, each hit deals an additional `1d4` **Slash** damage.",
} satisfies Skill
