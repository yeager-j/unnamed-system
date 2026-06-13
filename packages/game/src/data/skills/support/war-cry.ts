import type { Skill } from "@workspace/game/foundation/skills/schema"

export const warCry = {
  kind: "support",
  key: "war-cry",
  name: "War Cry",
  tagline: "Lowers all Engaged enemies' Defense for 3 turns.",
  description: "Decreases the **Defense** of all Engaged enemies for 3 turns.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 12 },
  range: { kind: "known", value: "all-engaged" },
  duration: 3,
  effect: "**(Berserker/Frenzy Mode)** Also decreases their **Attack** power.",
} satisfies Skill
