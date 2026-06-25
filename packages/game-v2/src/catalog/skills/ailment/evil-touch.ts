import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const evilTouch = {
  kind: "ailment",
  key: "evil-touch",
  name: "Evil Touch",
  tagline: "Inflicts Fear on one enemy on a 7+.",
  description: "Inflicts **Fear** on one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  attackRoll: {
    attribute: "lu",
    tiers: [
      { band: "7+", sideEffects: ["fear"] },
      { band: "20+", sideEffects: ["auto-fear"] },
    ],
  },
} satisfies Skill
