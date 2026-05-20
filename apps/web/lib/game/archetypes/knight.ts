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
  mechanic: {
    kind: "valor",
    displayName: "Valor",
    tagline:
      "Build a 0–7 Valor counter by acting as the bulwark of your party.",
    description: `You have a Valor score (max 7), which accumulates as you act as the heroic bulwark of your party. Some Skills gain additional effects by consuming Valor. You also gain the following benefits provided your Valor meets the threshold:

- \`1+\`: If the Attack Roll of your opportunity attack is 11+ and you deal damage, the target's Move action fails.
- \`2+\`: Enemies must make a saving throw to successfully Disengage with you.
- \`3+\`: Your affinities for Slash, Pierce, and Strike become Resist.
- \`4+\`: You are not Downed by receiving damage to your Weakness.
- \`5+\`: If the Attack Roll of your opportunity attack is 20+ and you deal damage, the target is Downed.

***Knight's Protection.*** When an enemy targets an ally within your Zone for an attack, you can choose to redirect any damage and side effects to yourself. If you do so, you gain 2 Valor. If you do not do so, you lose 1 Valor.`,
  },
} satisfies Archetype
