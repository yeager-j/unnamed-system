import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const hammerOfJustice = {
  kind: "attack",
  key: "hammer-of-justice",
  name: "Hammer of Justice",
  tagline:
    "Heavy Pierce to all Engaged. Hit enemies become Weak to Pierce once.",
  description:
    "Deals heavy **Pierce** damage to all Engaged enemies. If an enemy took damage, their affinity to **Pierce** changes to **Weak** for one instance of **Pierce** damage.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 18 },
  range: { kind: "known", value: "all-engaged" },
  damage: { damageType: "pierce", delivery: "physical" },
  formula: "8d10",
  effect:
    "**(Knight Only)** You can spend 7 **Valor** to make the affinity change permanent.",
} satisfies Skill
