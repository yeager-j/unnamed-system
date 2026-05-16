import type { Skill } from "./schema"

export const slashBoost = {
  kind: "passive",
  key: "slash-boost",
  name: "Slash Boost",
  description: "+2 to Attack Rolls that deal Slash damage.",
  archetypeKey: "warrior",
  isSynthesis: false,
} satisfies Skill
