import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const grandHeist = {
  kind: "attack",
  key: "grand-heist",
  name: "Grand Heist",
  tagline:
    "Cooperative finisher: detonate planted Weaknesses on all enemies in a Zone.",
  description:
    "The crew's signature score. Detonates every Weakness planted with **Elemental Larceny**, dealing severe damage to all enemies in a Zone.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 18 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "special", delivery: "physical" },
  formula: "10d10",
  targets: "All Enemies",
  effect:
    "Each enemy takes `severe` damage of every element they are **Weak** to — including a Weakness you planted with **Mark**. An enemy with no Weakness instead takes `3d10` **Almighty** damage.",
} satisfies Skill
