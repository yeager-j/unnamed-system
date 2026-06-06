import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const shadow = {
  key: "shadow",
  level: 3,
  name: "Shadow",
  maxHP: 24,
  attributes: { strength: 0, magic: 2, agility: 1, luck: 0 },
  affinities: {
    slash: "null",
    pierce: "null",
    strike: "null",
    light: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  talents: ["sneak"],
} satisfies EnemyDefinition
