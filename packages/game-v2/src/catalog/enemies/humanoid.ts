import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const goblin = defineEnemy({
  key: "goblin",
  level: 1,
  name: "Goblin",
  maxHP: 16,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { wind: "weak", dark: "resist" },
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
      damage: { damageType: "slash", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
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
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
  talents: ["sneak"],
})

export const goblinWarrior = defineEnemy({
  key: "goblin-warrior",
  level: 2,
  name: "Goblin Warrior",
  maxHP: 20,
  attributes: { strength: 0, magic: -1, agility: 2, luck: 0 },
  affinities: { fire: "weak", dark: "resist" },
  inlineSkills: [
    {
      kind: "attack",
      key: "goblin-warrior-scimitar",
      name: "Scimitar",
      tagline: "The Goblin slashes at an enemy with their scimitar.",
      description: "The Goblin slashes at an enemy with their scimitar.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "slash", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "attack",
      key: "goblin-warrior-shortbow",
      name: "Shortbow",
      tagline: "The Goblin shoots at an enemy with their shortbow.",
      description: "The Goblin shoots at an enemy with their shortbow.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
  talents: ["sneak"],
})

export const goblinLeader = defineEnemy({
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
      damage: { damageType: "slash", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
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
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
  talents: ["sneak"],
})

export const bandit = defineEnemy({
  key: "bandit",
  level: 2,
  name: "Bandit",
  maxHP: 20,
  attributes: { strength: 0, magic: -1, agility: 1, luck: 0 },
  affinities: { fire: "resist", ice: "weak" },
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
      damage: { damageType: "slash", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
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
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
  talents: ["sneak"],
})

export const banditCaptain = defineEnemy({
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
      damage: { damageType: "slash", delivery: "physical", hits: 2 },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
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
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d10 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d10 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  ],
  talents: ["sneak"],
})

export const bugbear = defineEnemy({
  key: "bugbear",
  level: 4,
  name: "Bugbear",
  maxHP: 35,
  attributes: { strength: 2, magic: -1, agility: 1, luck: 0 },
  affinities: { slash: "resist", elec: "resist", light: "weak" },
  inlineSkills: [
    {
      kind: "attack",
      key: "bugbear-morningstar",
      name: "Morningstar",
      tagline: "The Bugbear smashes its Morningstar at an enemy.",
      description: "The Bugbear smashes its Morningstar at an enemy.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: F["1d4 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d8 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d8 + St"], sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "attack",
      key: "bugbear-javelin",
      name: "Javelin",
      tagline: "The Bugbear throws a javelin at a target within range.",
      description: "The Bugbear throws a javelin at a target within range.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
    {
      kind: "passive",
      key: "bugbear-surprise-attack",
      name: "Surprise Attack",
      tagline: "Deals an extra 1d8 damage during an Ambush round.",
      description:
        "During an Ambush round, weapons and Skills deal an additional `1d8` damage.",
      isSynthesis: false,
    },
  ],
  talents: ["sneak"],
})

export const HUMANOID_ENEMIES = {
  goblin,
  "goblin-warrior": goblinWarrior,
  "goblin-leader": goblinLeader,
  bandit,
  "bandit-captain": banditCaptain,
  bugbear,
} as const satisfies Record<string, Entity>
