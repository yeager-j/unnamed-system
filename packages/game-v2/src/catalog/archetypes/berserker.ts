import type { Archetype } from "@workspace/game-v2/archetypes"

export const berserker = {
  key: "berserker",
  name: "Berserker",
  lineage: "berserker",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["athletics", "demolish", "intimidate"],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 3, magic: -1, agility: 0, luck: 1 },
  affinities: { pierce: "resist", mind: "weak" },
  skills: [
    { rank: 1, skill: "bash" },
    { rank: 2, skill: "war-cry" },
    { rank: 3, skill: "spirit-break" },
    { rank: 4, skill: "rampage" },
    { rank: 5, skill: "auto-tarukaja" },
  ],
  synthesisSkill: { rank: 5, skill: "wanton-destruction" },
  mechanic: "frenzy",
} satisfies Archetype
