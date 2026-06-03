import type { EnemyDefinition } from "../../schema"

export const wolf = {
  key: "wolf",
  level: 2,
  name: "Wolf",
  maxHP: 21,
  attributes: { strength: 1, magic: -1, agility: 2, luck: -1 },
  affinities: { fire: "weak", ice: "resist" },
  skillKeys: [],
  talents: ["sense", "sneak"],
  abilities: `**Bite** — The Wolf bites at an enemy.

Range: **Engaged**; Damage: **Pierce (Physical)**

Attack Roll + St:
- **1–10**: \`1 + St\`
- **11–19**: \`1d6 + St\`
- **20+**: \`1d6 + St\` *(Critical)*

**Pack Tactics** — Gains Advantage on physical Attack Rolls if at least one ally is Engaged with the same target as this creature.`,
} satisfies EnemyDefinition
