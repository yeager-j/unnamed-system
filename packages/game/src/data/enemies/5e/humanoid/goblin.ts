import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const goblin = {
  key: "goblin",
  level: 1,
  name: "Goblin",
  maxHP: 16,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { wind: "weak", dark: "resist" },
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

Attack Roll + 1:
- **1–10**: \`1 + 1\`
- **11–19**: \`1d6 + 1\`
- **20+**: \`1d6 + 1\` *(Critical)*`,
} satisfies EnemyDefinition
