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
  mechanic: {
    kind: "stains",
    displayName: "Stains",
    tagline:
      "Elemental Skills leave Stains behind that later Skills consume for bonus effects.",
    description: `The elemental Skills you cast on your turn leave behind residue that empowers the Skills you cast in the future.

***Generating Stains.*** Some Skills generate Stains when cast. You gain these Stains whether or not the attack hits or does damage. You can have up to 4 Stains at any one time. If you would exceed this limit, choose one or more of your Stains to replace.

***Consuming Stains.*** Some Skills consume Stains to produce additional effects. You do not choose whether or not to consume Stains; if the Stain(s) is available, it is consumed.`,
  },
} satisfies Archetype
