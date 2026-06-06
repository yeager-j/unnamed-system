import type { Archetype } from "@workspace/game/foundation/archetypes/schema"

export const warlock = {
  key: "warlock",
  name: "Warlock",
  lineage: "warlock",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["alchemy", "intimidate", "sense"],
  mastery: { kind: "sp", amount: 20 },
  attributes: { strength: -1, magic: 1, agility: 1, luck: 2 },
  affinities: { strike: "weak", light: "weak", dark: "resist" },
  skills: [
    { rank: 1, skill: "eiha" },
    { rank: 2, skill: "pulpina" },
    { rank: 3, skill: "evil-touch" },
    { rank: 4, skill: "makajam" },
    { rank: 5, skill: "ailment-boost" },
  ],
  synthesisSkill: { rank: 5, skill: "door-to-hades" },
  mechanic: "path-of-dusk",
} satisfies Archetype
