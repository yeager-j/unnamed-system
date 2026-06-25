import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const slashBoost = {
  kind: "passive",
  key: "slash-boost",
  name: "Slash Boost",
  tagline: "+2 to Slash Attack Rolls.",
  description: "**+2** to Attack Rolls that deal **Slash** damage.",
  isSynthesis: false,
  effects: [
    {
      type: "attackRoll",
      amount: 2,
      when: { damageTypes: ["slash"] },
      source: "Slash Boost",
    },
  ],
} satisfies Skill
