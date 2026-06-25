import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const amritaDrop = {
  kind: "heal",
  key: "amrita-drop",
  name: "Amrita Drop",
  tagline: "Cure all Ailments (except Downed) on one ally.",
  description: "Cure all **Ailments** (except **Downed**) for one ally.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 6 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
} satisfies Skill
