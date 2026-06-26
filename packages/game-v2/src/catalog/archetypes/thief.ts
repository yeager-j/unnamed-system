import type { Archetype } from "@workspace/game-v2/archetypes"

export const thief = {
  key: "thief",
  name: "Thief",
  lineage: "thief",
  tier: "initiate",
  prerequisites: [],
  inheritanceSlots: 2,
  talents: ["climb", "sneak", "lockpick"],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: -1, magic: 0, agility: 2, luck: 2 },
  affinities: { ice: "weak", dark: "resist" },
  skills: [
    { rank: 1, skill: "feint" },
    { rank: 2, skill: "cruel-attack" },
    { rank: 3, skill: "flash-bomb" },
    { rank: 4, skill: "memory-blow" },
    { rank: 5, skill: "auto-sukukaja" },
  ],
  synthesisSkill: { rank: 5, skill: "phantom-tracer" },
  mechanic: "thiefs-insight",
} satisfies Archetype
