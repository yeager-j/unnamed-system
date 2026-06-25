import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const showtime = {
  kind: "attack",
  key: "showtime",
  name: "Showtime!",
  tagline: "Heavy Almighty to all enemies in a Zone, then debilitates them.",
  description:
    "Deals heavy **Almighty** damage to all enemies in a Zone and debilitates them.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 16 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "almighty", delivery: "magical" },
  formula: "6d8",
  targets: "All Enemies",
  effect:
    "If an enemy took this damage, their **Attack**, **Defense**, and **Hit/Evasion** are decreased for 3 turns. Enemies take an additional `2d8` damage per Forte of the target Zone, if any.",
} satisfies Skill
