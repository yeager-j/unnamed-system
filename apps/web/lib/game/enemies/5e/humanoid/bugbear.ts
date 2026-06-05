import type { EnemyDefinition } from "../../schema"

export const bugbear = {
  key: "bugbear",
  level: 4,
  name: "Bugbear",
  maxHP: 35,
  attributes: { strength: 2, magic: -1, agility: 1, luck: 0 },
  affinities: { slash: "resist", elec: "resist", light: "weak" },
  skillKeys: [],
  talents: ["sneak"],
  abilities: `**Morningstar** — The Bugbear smashes its Morningstar at an enemy.

Range: **Engaged**; Damage: **Pierce (Physical)**

Attack Roll + 2:
- **1–10**: \`1d4 + 2\`
- **11–19**: \`1d8 + 2\`
- **20+**: \`1d8 + 2\` *(Critical)*

**Javelin** — The Bugbear throws a javelin at a target within range.

Range: **Same/Adjacent Zone**; Damage: **Pierce (Physical)**

Attack Roll + 1:
- **1–10**: \`1 + 1\`
- **11–19**: \`1d6 + 1\`
- **20+**: \`1d6 + 1\` *(Critical)*

**Surprise Attack** — During an Ambush round, weapons and Skills deal an additional \`1d8\` damage.`,
} satisfies EnemyDefinition
