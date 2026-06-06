import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

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

Attack Roll + 0:
- **1–10**: \`1 + 0\`
- **11–19**: \`1d6 + 0\`
- **20+**: \`1d6 + 0\` *(Critical)*

**Shortbow** — The Goblin shoots at an enemy with their shortbow.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + 2:
- **1–10**: \`1 + 2\`
- **11–19**: \`1d6 + 2\`
- **20+**: \`1d6 + 2\` *(Critical)*`,
} satisfies EnemyDefinition
