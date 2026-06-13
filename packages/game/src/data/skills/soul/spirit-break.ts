import type { Skill } from "@workspace/game/foundation/skills/schema"

export const spiritBreak = {
  kind: "attack",
  key: "spirit-break",
  name: "Spirit Break",
  tagline: "Weak single-target Soul. No-Cure on a 20+.",
  description: "Deals weak **Soul** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damageType: "soul",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["no-cure"] },
    ],
  },
  effect:
    "**(Berserker/Frenzy Mode)** On a **`20+`**, also inflicts *Despair*.",
} satisfies Skill
