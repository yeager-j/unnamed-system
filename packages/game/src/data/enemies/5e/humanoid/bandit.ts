import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const bandit = {
  key: "bandit",
  level: 2,
  name: "Bandit",
  maxHP: 20,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { fire: "resist", ice: "weak" },
  skillKeys: [],
  inlineSkills: [
    {
      kind: "attack",
      key: "bandit-scimitar",
      name: "Scimitar",
      tagline: "The Bandit slashes at an enemy with their scimitar.",
      description: "The Bandit slashes at an enemy with their scimitar.",
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
      key: "bandit-crossbow",
      name: "Crossbow",
      tagline: "The Bandit shoots at an enemy with their crossbow.",
      description: "The Bandit shoots at an enemy with their crossbow.",
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
