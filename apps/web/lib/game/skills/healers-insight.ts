import type { Skill } from "./schema"

export const healersInsight = {
  kind: "passive",
  key: "healers-insight",
  name: "Healer's Insight",
  description: "Recover 1 HP for each SP you spend.",
  archetypeKey: "healer",
  isSynthesis: false,
} satisfies Skill
