import type { Skill } from "@workspace/game/foundation/skills/schema"

export const bardsInsight = {
  kind: "passive",
  key: "bards-insight",
  name: "Bard's Insight",
  tagline:
    "Recover 3 HP at the start of each turn while Attack, Defense, or Hit/Evasion is increased.",
  description:
    "Recover 3 HP at the start of each of your turns while your **Attack**, **Defense**, or **Hit/Evasion** is increased.",
  isSynthesis: false,
} satisfies Skill
