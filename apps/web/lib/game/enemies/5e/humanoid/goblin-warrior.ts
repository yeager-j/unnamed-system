import type { EnemyDefinition } from "../../schema"

export const goblinWarrior = {
  key: "goblin-warrior",
  level: 2,
  name: "Goblin Warrior",
  maxHP: 20,
  attributes: { strength: 0, magic: -1, agility: 2, luck: 0 },
  affinities: { fire: "weak", dark: "resist" },
  skillKeys: [],
  talents: ["sneak"],
  abilities: `**Scimitar** — The Goblin slashes at an enemy with their scimitar.

Range: **Engaged**; Damage: **Slash (Physical)**

Attack Roll + St:
- **1–10**: \`1 + St\`
- **11–19**: \`1d6 + St\`
- **20+**: \`1d6 + St\` *(Critical)*

**Shortbow** — The Goblin shoots at an enemy with their shortbow.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + Ag:
- **1–10**: \`1 + Ag\`
- **11–19**: \`1d6 + Ag\`
- **20+**: \`1d6 + Ag\` *(Critical)*`,
} satisfies EnemyDefinition
