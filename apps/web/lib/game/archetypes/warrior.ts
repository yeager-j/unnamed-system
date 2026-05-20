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
    description: `The flawlessness of your fighting ability is represented by your Perfection, which ranges from D at the lowest to S at the highest. When you begin combat, your Perfection is set to D. When your Perfection increases or decreases, it follows the order of:

D ⇄ C ⇄ B ⇄ A ⇄ S

***Gaining Perfection.*** Your Perfection increases by 1 step when you hit an enemy with an Attack Roll. If you Down an enemy, your Perfection increases by 1 additional step.

***Losing Perfection.*** When you take damage while your Perfection is C or better, make a saving throw. On a fail, your Perfection decreases by 1 step. If you become Fallen or are Downed, your Perfection is set to D.

***Perfection Effects.*** You gain +1 to Attack Rolls for each step above D. For example, at C you gain +1 and at S you gain +4. Some Skills may gain additional effects depending on your Perfection.`,
  },
} satisfies Archetype
