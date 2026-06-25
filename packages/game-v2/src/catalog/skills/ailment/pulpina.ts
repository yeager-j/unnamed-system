import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const pulpina = {
  kind: "ailment",
  key: "pulpina",
  name: "Pulpina",
  tagline: "Inflicts Confuse on one enemy on a 7+.",
  description: "Inflicts **Confuse** on one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  attackRoll: {
    attribute: "lu",
    tiers: [
      { band: "7+", sideEffects: ["confuse"] },
      { band: "20+", sideEffects: ["auto-confuse"] },
    ],
  },
} satisfies Skill
