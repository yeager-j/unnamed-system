import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const goblin = {
  key: "goblin",
  level: 1,
  name: "Goblin",
  maxHP: 16,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { wind: "weak", dark: "resist" },
  skillKeys: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "goblin-scimitar",
      name: "Scimitar",
      tagline: "The Goblin slashes at an enemy with their scimitar.",
      description: "The Goblin slashes at an enemy with their scimitar.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "slash",
      delivery: "physical",
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: "1 + St", sideEffects: [] },
          { band: "11-19", formula: "1d6 + St", sideEffects: [] },
          { band: "20+", formula: "1d6 + St", sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "attack",
      key: "goblin-shortbow",
      name: "Shortbow",
      tagline: "The Goblin shoots at an enemy with their shortbow.",
      description: "The Goblin shoots at an enemy with their shortbow.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: "1 + Ag", sideEffects: [] },
          { band: "11-19", formula: "1d6 + Ag", sideEffects: [] },
          { band: "20+", formula: "1d6 + Ag", sideEffects: ["critical"] },
        ],
      },
    },
  ] satisfies Skill[],
  talents: ["sneak"],
} satisfies EnemyDefinition
