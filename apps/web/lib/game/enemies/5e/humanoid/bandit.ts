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

Attack Roll + St:
- **1–10**: \`1 + St\`
- **11–19**: \`1d6 + St\`
- **20+**: \`1d6 + St\` *(Critical)*

**Crossbow** — The Bandit shoots at an enemy with their crossbow.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + Ag:
- **1–10**: \`1 + Ag\`
- **11–19**: \`1d6 + Ag\`
- **20+**: \`1d6 + Ag\` *(Critical)*`,
} satisfies EnemyDefinition
