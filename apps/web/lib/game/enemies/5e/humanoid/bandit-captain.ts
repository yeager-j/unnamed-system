import type { EnemyDefinition } from "../../schema"

export const banditCaptain = {
  key: "bandit-captain",
  level: 5,
  name: "Bandit Captain",
  maxHP: 60,
  attributes: { strength: 1, magic: 1, agility: 2, luck: 1 },
  affinities: { slash: "resist", fire: "resist" },
  skillKeys: ["garu", "zio"],
  talents: ["sneak"],
  abilities: `**Scimitar** — The Bandit slashes at an enemy with their scimitar.

Range: **Engaged**; Hits: **2**; Damage: **Slash (Physical)**

Attack Roll + 1:
- **1–10**: \`1 + 1\`
- **11–19**: \`1d6 + 1\`
- **20+**: \`1d6 + 1\` *(Critical)*

**Pistol** — The Bandit shoots at an enemy with their pistol.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + 2:
- **1–10**: \`1d6 + 2\`
- **11–19**: \`1d10 + 2\`
- **20+**: \`1d10 + 2\` *(Critical)*`,
} satisfies EnemyDefinition
