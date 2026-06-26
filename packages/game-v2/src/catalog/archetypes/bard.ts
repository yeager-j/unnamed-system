import type { Archetype } from "@workspace/game-v2/archetypes"

export const bard = {
  key: "bard",
  name: "Bard",
  lineage: "bard",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["enchant", "flirt", "perform"],
  mastery: { kind: "sp", amount: 20 },
  attributes: { strength: -1, magic: 1, agility: 2, luck: 1 },
  affinities: { elec: "weak", mind: "resist" },
  skills: [
    { rank: 1, skill: "cantata" },
    { rank: 2, skill: "tarukaja" },
    { rank: 3, skill: "rakukaja" },
    { rank: 4, skill: "sukukaja" },
    { rank: 5, skill: "bards-insight" },
  ],
  synthesisSkill: { rank: 5, skill: "showtime" },
  mechanic: "enchantment",
} satisfies Archetype
