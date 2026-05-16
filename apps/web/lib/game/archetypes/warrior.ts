import type { Archetype } from "../schema"

export const warrior = {
  key: "warrior",
  name: "Warrior",
  lineage: "warrior",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["Climb", "Lift", "Athletics"],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 2, magic: -1, agility: 1, luck: 1 },
  affinities: { fire: "resist", wind: "weak" },
  skills: [
    { rank: 1, skill: "cleave" },
    { rank: 2, skill: "windblade" },
    { rank: 3, skill: "tempest-slash" },
    { rank: 4, skill: "critical-strike" },
    { rank: 5, skill: "slash-boost" },
  ],
  synthesisSkill: { rank: 5, skill: "peerless-stonecleaver" },
} satisfies Archetype
