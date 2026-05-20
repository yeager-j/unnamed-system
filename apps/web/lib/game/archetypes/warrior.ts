import type { Archetype } from "./schema"

export const warrior = {
  key: "warrior",
  name: "Warrior",
  lineage: "warrior",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["climb", "lift", "athletics"],
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
  mechanic: {
    kind: "perfection",
    displayName: "Perfection",
    tagline:
      "Land Attack Rolls to climb the chain D → C → B → A → S, adding +1 to your Attack Rolls per step.",
    description:
      "Land Attack Rolls to climb the chain D → C → B → A → S. Each step above D adds +1 to your Attack Rolls; resets when you are Downed or the encounter ends.",
  },
} satisfies Archetype
