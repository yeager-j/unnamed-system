import type { Skill } from "./schema"

export const ailmentBoost = {
  kind: "passive",
  key: "ailment-boost",
  name: "Ailment Boost",
  tagline: "+2 to Ailment Attack Rolls per allied Warlock Lineage in combat.",
  description:
    "**+2** to Ailment Attack Rolls per **Warlock Lineage** on your side (including yourself) in the current combat encounter.",
  isSynthesis: false,
  effects: [
    {
      type: "attackRoll",
      when: { skillKinds: ["ailment"] },
      scaler: {
        kind: "perPartyLineage",
        lineage: "warlock",
        amount: 2,
        includesSelf: true,
      },
      source: "Ailment Boost",
    },
  ],
} satisfies Skill
