import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const avarice = {
  kind: "passive",
  key: "avarice",
  name: "Avarice",
  tagline: "Your hits on a Weakness deal 2× damage instead of 1.5×.",
  description:
    "Greed sharpens the knife. When you strike an enemy's **Weakness**, you deal **2×** damage instead of the usual 1.5×.",
  isSynthesis: false,
} satisfies Skill
