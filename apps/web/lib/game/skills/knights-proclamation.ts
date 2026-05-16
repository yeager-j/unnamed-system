import type { Skill } from "./schema"

export const knightsProclamation = {
  kind: "support",
  key: "knights-proclamation",
  name: "Knight's Proclamation",
  description:
    "Each Free enemy in your current Zone with a Luck score lower than yours must use their Move action on their next turn to Engage you, if possible.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 8 },
  range: { kind: "known", value: "same-zone" },
  effect: "(Knight Only) Gain 1 Valor per affected enemy.",
} satisfies Skill
