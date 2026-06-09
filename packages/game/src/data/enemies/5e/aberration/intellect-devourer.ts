import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const intellectDevourer = {
  key: "intellect-devourer",
  level: 4,
  name: "Intellect Devourer",
  maxHP: 28,
  attributes: { strength: -2, magic: 2, agility: 1, luck: 0 },
  affinities: { soul: "weak", mind: "drain", light: "weak" },
  skillKeys: ["psi"],
  talents: ["sneak"],
  abilities: `**Devour Intellect** — If a target takes Mind damage dealt by this creature's Skills, they are Downed if the Attack Roll was 20+.

**Body Thief** — The Intellect Devourer psychically seizes control of their body.

Range: **Same Zone**

Effect: Only usable against a Downed creature. The target gains the **Brainwash** Ailment until this Intellect Devourer dies.

**Detect Sentience** — The Intellect Devourer can sense the presence and location of any creature within 10 Zones of it if the creature has any Virtue ranks.`,
} satisfies EnemyDefinition
