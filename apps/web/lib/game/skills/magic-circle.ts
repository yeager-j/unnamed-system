import type { Skill } from "./schema"

export const magicCircle = {
  kind: "passive",
  key: "magic-circle",
  name: "Magic Circle",
  tagline: "+1 to Magical Attack Rolls per allied Mage Lineage in combat.",
  description:
    "**+1** to Magical Attack Rolls per **Mage Lineage** on your side (including yourself) in the current combat encounter.",
  isSynthesis: false,
} satisfies Skill
