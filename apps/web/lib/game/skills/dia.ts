import type { Skill } from "./schema"

export const dia = {
  kind: "heal",
  key: "dia",
  name: "Dia",
  tagline: "Weak HP heal for one ally.",
  description: "Weak **HP** recovery for one ally.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: "2d8 + Ma",
} satisfies Skill
