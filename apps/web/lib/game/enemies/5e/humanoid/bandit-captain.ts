import type { EnemyDefinition } from "../../schema"

export const banditCaptain = {
  key: "bandit-captain",
  level: 5,
  name: "Bandit Captain",
  maxHP: 60,
  attributes: { strength: 1, magic: -1, agility: 2, luck: 1 },
  affinities: { slash: "resist", fire: "resist" },
  skillKeys: ["garu", "zio"],
  talents: ["sneak"],
  abilities: `**Scimitar** — The Bandit slashes at an enemy with their scimitar.

Range: **Engaged**; Hits: **2**; Damage: **Slash (Physical)**

Attack Roll + St:
- **1–10**: \`1 + St\`
- **11–19**: \`1d6 + St\`
- **20+**: \`1d6 + St\` *(Critical)*

**Pistol** — The Bandit shoots at an enemy with their pistol.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + Ag:
- **1–10**: \`1d6 + Ag\`
- **11–19**: \`1d10 + Ag\`
- **20+**: \`1d10 + Ag\` *(Critical)*`,
} satisfies EnemyDefinition
