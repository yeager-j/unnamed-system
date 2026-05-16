import type { Skill } from "./schema"

export const elementalApocalypse = {
  kind: "attack",
  key: "elemental-apocalypse",
  name: "Elemental Apocalypse",
  description:
    "Deals medium Fire, Ice, Elec, and Wind damage to all enemies in a Zone.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 16 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "special",
  delivery: "magical",
  damage: "12d8",
  targets: "All Enemies",
  effect:
    "Each enemy takes `3d8 Fire + Ma`, `3d8 Ice + Ma`, `3d8 Elec + Ma`, and `3d8 Wind + Ma` damage. Can consume Stains to bypass Resist/Null/Repel/Drain for that damage type.",
} satisfies Skill
