import type { Skill } from "@workspace/game/foundation/skills/schema"

export const autoTarukaja = {
  kind: "passive",
  key: "auto-tarukaja",
  name: "Auto-Tarukaja",
  tagline: "Increases your Attack for 3 turns at the start of combat.",
  description:
    "Increases your **Attack** power for 3 turns at the start of combat.",
  isSynthesis: false,
} satisfies Skill
