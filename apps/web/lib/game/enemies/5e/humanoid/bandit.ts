import type { EnemyDefinition } from "../../schema"

export const bandit = {
  key: "bandit",
  level: 2,
  name: "Bandit",
  maxHP: 20,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { fire: "resist", ice: "weak" },
  skillKeys: [],
  talents: ["sneak"],
  abilities: `**Scimitar** — The Bandit slashes at an enemy with their scimitar.

Range: **Engaged**; Damage: **Slash (Physical)**

Attack Roll + 0:
- **1–10**: \`1 + 0\`
- **11–19**: \`1d6 + 0\`
- **20+**: \`1d6 + 0\` *(Critical)*

**Crossbow** — The Bandit shoots at an enemy with their crossbow.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + 1:
- **1–10**: \`1 + 1\`
- **11–19**: \`1d6 + 1\`
- **20+**: \`1d6 + 1\` *(Critical)*`,
} satisfies EnemyDefinition
