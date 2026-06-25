import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const autoRakukaja = {
  kind: "passive",
  key: "auto-rakukaja",
  name: "Auto-Rakukaja",
  tagline: "Increases your Defense for 3 turns at the start of combat.",
  description: "Increases your **Defense** for 3 turns at the start of combat.",
  isSynthesis: false,
} satisfies Skill
