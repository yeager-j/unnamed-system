import type { Archetype } from "./schema"

export const healer = {
  key: "healer",
  name: "Healer",
  lineage: "healer",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["medicine", "nature", "monsters"],
  mastery: { kind: "sp", amount: 20 },
  attributes: { strength: -1, magic: 1, agility: 1, luck: 2 },
  affinities: { strike: "weak", light: "resist", dark: "weak" },
  skills: [
    { rank: 1, skill: "kouha" },
    { rank: 2, skill: "dia" },
    { rank: 3, skill: "media" },
    { rank: 4, skill: "amrita-drop" },
    { rank: 5, skill: "healers-insight" },
  ],
  synthesisSkill: { rank: 5, skill: "divine-judgment" },
} satisfies Archetype
