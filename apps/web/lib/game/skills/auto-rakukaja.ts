import type { Skill } from "./schema"

export const autoRakukaja = {
  kind: "passive",
  key: "auto-rakukaja",
  name: "Auto-Rakukaja",
  description: "Increases your Defense for 3 turns at the start of combat.",
  archetypeKey: "knight",
  isSynthesis: false,
} satisfies Skill
