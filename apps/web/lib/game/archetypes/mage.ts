import type { Archetype } from "./schema"

export const mage = {
  key: "mage",
  name: "Mage",
  lineage: "mage",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["arcana", "alchemy", "enchant"],
  mastery: { kind: "sp", amount: 20 },
  attributes: { strength: -1, magic: 2, agility: 1, luck: 1 },
  affinities: { pierce: "weak", ice: "resist" },
  skills: [
    { rank: 1, skill: "agi" },
    { rank: 2, skill: "bufu" },
    { rank: 3, skill: "zio" },
    { rank: 4, skill: "garu" },
    { rank: 5, skill: "magic-circle" },
  ],
  synthesisSkill: { rank: 5, skill: "elemental-apocalypse" },
  mechanic: "stains",
} satisfies Archetype
