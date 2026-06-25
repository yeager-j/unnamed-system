import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const healersInsight = {
  kind: "passive",
  key: "healers-insight",
  name: "Healer's Insight",
  tagline: "Recover 1 HP per SP spent.",
  description: "Recover 1 **HP** for each **SP** you spend.",
  isSynthesis: false,
} satisfies Skill
