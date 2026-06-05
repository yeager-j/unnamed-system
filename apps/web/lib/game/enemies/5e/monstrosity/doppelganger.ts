import type { EnemyDefinition } from "../../schema"

export const doppelganger = {
  key: "doppelganger",
  level: 5,
  name: "Doppelganger",
  maxHP: 60,
  attributes: { strength: 3, magic: -1, agility: 2, luck: 1 },
  affinities: { strike: "resist", elec: "weak", psy: "null" },
  skillKeys: ["psi"],
  talents: ["lie", "interrogate"],
  abilities: `**Slam** — The Doppelganger slams its fist into a target twice.

Range: **Engaged**; Hits: **2**; Damage: **Strike (Physical)**

Attack Roll + 3:
- **1–10**: \`1 + 3\`
- **11–19**: \`1d6 + 3\`
- **20+**: \`1d6 + 3\` *(Critical)*

**Ambusher** — Cannot be Ambushed; a successful Ambush by the opposing side results in a neutral combat encounter.

**Surprise Attack** — During an Ambush round, weapons and Skills deal an additional \`2d8\` damage.`,
} satisfies EnemyDefinition
