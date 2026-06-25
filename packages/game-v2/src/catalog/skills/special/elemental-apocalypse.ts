import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const elementalApocalypse = {
  kind: "attack",
  key: "elemental-apocalypse",
  name: "Elemental Apocalypse",
  tagline: "Medium Fire/Ice/Elec/Wind to all enemies in a Zone.",
  description:
    "Deals medium **Fire**, **Ice**, **Elec**, and **Wind** damage to all enemies in a Zone.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 16 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "special", delivery: "magical" },
  formula: "12d8",
  targets: "All Enemies",
  effect:
    "Each enemy takes `3d8 Fire + Ma`, `3d8 Ice + Ma`, `3d8 Elec + Ma`, and `3d8 Wind + Ma` damage. Can consume **Stains** to bypass **Resist**/**Null**/**Repel**/**Drain** for that damage type.",
} satisfies Skill
