import type { Skill } from "./schema"

export const magicCircle = {
  kind: "passive",
  key: "magic-circle",
  name: "Magic Circle",
  description:
    "+1 to Magical Attack Rolls per Mage Lineage on your side (including yourself) in the current combat encounter.",
  archetypeKey: "mage",
  isSynthesis: false,
} satisfies Skill
