import type { Archetype } from "./schema"

export const knight = {
  key: "knight",
  name: "Knight",
  lineage: "knight",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["lift", "culture", "history"],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 2, magic: -1, agility: 0, luck: 2 },
  affinities: { slash: "resist", fire: "weak" },
  skills: [
    { rank: 1, skill: "skewer" },
    { rank: 2, skill: "knights-proclamation" },
    { rank: 3, skill: "storm-thrust" },
    { rank: 4, skill: "shield-arts" },
    { rank: 5, skill: "auto-rakukaja" },
  ],
  synthesisSkill: { rank: 5, skill: "hammer-of-justice" },
} satisfies Archetype
