import type { Skill } from "./schema"

export const amritaDrop = {
  kind: "heal",
  key: "amrita-drop",
  name: "Amrita Drop",
  description: "Cure all Ailments (except Downed) for one ally.",
  archetypeKey: "healer",
  isSynthesis: false,
  cost: { kind: "sp", amount: 6 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
} satisfies Skill
