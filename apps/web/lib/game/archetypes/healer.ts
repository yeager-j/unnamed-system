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
    description: `Searing light magic rains down on your enemies when you take mercy on your allies. When you use a Skill that deals Light damage, you enter into ***Dawn Mode*** and you apply one ***Lumina*** counter on any enemies that took damage (an enemy with Lumina counters is ***Illuminated***). An enemy can have a maximum number of Lumina equal to your Luck.

An Illuminated enemy cannot turn invisible and it lights up the Zone it occupies with bright light.

When you use a Skill that restores HP or cures Ailments, each Illuminated enemy takes \`1d4\` Light damage per Lumina, which are consumed. Additionally, if you were in Dawn Mode, you recover SP equal to the number of Lumina consumed and you exit Dawn Mode.

When combat ends, all unused Lumina disappear and you exit Dawn Mode.`,
  },
} satisfies Archetype
