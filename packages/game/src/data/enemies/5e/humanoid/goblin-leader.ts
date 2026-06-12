import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const goblinLeader = {
  key: "goblin-leader",
  level: 2,
  name: "Goblin Leader",
  maxHP: 25,
  attributes: { strength: 0, magic: 1, agility: 2, luck: 0 },
  affinities: { fire: "resist", dark: "resist" },
  skillKeys: ["agi"],
  inlineSkills: [
    {
      kind: "attack",
      key: "goblin-leader-scimitar",
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
      key: "goblin-leader-shortbow",
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
