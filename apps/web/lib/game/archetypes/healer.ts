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
  mechanic: {
    kind: "path-of-dawn",
    displayName: "Path of Dawn",
    tagline:
      "Light-damage Skills enter Dawn Mode and apply Lumina counters to struck enemies.",
    description:
      "Light-damage Skills enter Dawn Mode and apply Lumina to struck enemies (max per enemy = your Luck). HP-restoring or Ailment-curing Skills consume Lumina for 1d4 Light damage each, refunding SP and exiting Dawn Mode.",
  },
} satisfies Archetype
