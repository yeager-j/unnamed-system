import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const media = {
  kind: "heal",
  key: "media",
  name: "Media",
  tagline: "Weak HP heal for all allies in a Zone.",
  description: "Weak **HP** recovery for all allies in a Zone.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 7 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  formula: "2d8 + Ma",
  targets: "All Allies",
} satisfies Skill
