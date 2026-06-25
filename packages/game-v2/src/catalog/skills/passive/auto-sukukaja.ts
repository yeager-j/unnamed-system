import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const autoSukukaja = {
  kind: "passive",
  key: "auto-sukukaja",
  name: "Auto-Sukukaja",
  tagline: "Increases your Hit/Evasion for 3 turns at the start of combat.",
  description:
    "Increases your **Hit/Evasion** for 3 turns at the start of combat.",
  isSynthesis: false,
} satisfies Skill
