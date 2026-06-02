import type { Skill } from "../schema"

export const makajam = {
  kind: "ailment",
  key: "makajam",
  name: "Makajam",
  tagline: "Inflicts Forget on one enemy on a 7+.",
  description: "Inflicts **Forget** on one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  attackRoll: {
    attribute: "lu",
    tiers: [
      { band: "7+", sideEffects: ["forget"] },
      { band: "20+", sideEffects: ["auto-forget"] },
    ],
  },
} satisfies Skill
