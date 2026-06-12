import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const banditCaptain = {
  key: "bandit-captain",
  level: 5,
  name: "Bandit Captain",
  maxHP: 60,
  attributes: { strength: 1, magic: 1, agility: 2, luck: 1 },
  affinities: { slash: "resist", fire: "resist" },
  skillKeys: ["garu", "zio"],
  inlineSkills: [
    {
      kind: "attack",
      key: "bandit-captain-scimitar",
      name: "Scimitar",
      tagline: "The Bandit slashes at an enemy with their scimitar.",
      description: "The Bandit slashes at an enemy with their scimitar.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damageType: "slash",
      delivery: "physical",
      hits: 2,
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
      key: "bandit-captain-pistol",
      name: "Pistol",
      tagline: "The Bandit shoots at an enemy with their pistol.",
      description: "The Bandit shoots at an enemy with their pistol.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: "1d6 + Ag", sideEffects: [] },
          { band: "11-19", formula: "1d10 + Ag", sideEffects: [] },
          { band: "20+", formula: "1d10 + Ag", sideEffects: ["critical"] },
        ],
      },
    },
  ] satisfies Skill[],
  talents: ["sneak"],
} satisfies EnemyDefinition
