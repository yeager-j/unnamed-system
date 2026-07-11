import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const shadow = defineEnemy({
  key: "shadow",
  level: 3,
  name: "Shadow",
  maxHP: 24,
  attributes: { strength: 0, magic: 2, agility: 1, luck: 0 },
  affinities: {
    slash: "null",
    pierce: "null",
    strike: "null",
    light: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  talents: ["sneak"],
})

export const zombie = defineEnemy({
  key: "zombie",
  level: 2,
  name: "Zombie",
  maxHP: 30,
  attributes: { strength: 1, magic: -1, agility: 0, luck: 0 },
  affinities: {
    slash: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  inlineSkills: [
    {
      kind: "attack",
      key: "zombie-slam",
      name: "Slam",
      tagline: "The Zombie slams its fist into a target.",
      description: "The Zombie slams its fist into a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "strike", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [dice(1, 4), attr("st")], sideEffects: [] },
          { band: "11-19", formula: [dice(1, 8), attr("st")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 8), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
  ],
})

export const mummy = defineEnemy({
  key: "mummy",
  level: 3,
  name: "Mummy",
  maxHP: 40,
  attributes: { strength: 2, magic: 0, agility: 1, luck: 0 },
  affinities: {
    fire: "weak",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  inlineSkills: [
    {
      kind: "attack",
      key: "mummy-slam",
      name: "Slam",
      tagline: "The Mummy slams its fist into a target.",
      description: "The Mummy slams its fist into a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "strike", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [dice(1, 4), attr("st")], sideEffects: [] },
          { band: "11-19", formula: [dice(1, 8), attr("st")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 8), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
  ],
})

export const canopicGolem = defineEnemy({
  key: "canopic-golem",
  level: 6,
  name: "Canopic Golem",
  maxHP: 84,
  attributes: { strength: 3, magic: 1, agility: 1, luck: 1 },
  affinities: {
    fire: "repel",
    ice: "repel",
    elec: "repel",
    wind: "repel",
    dark: "drain",
  },
  skillKeys: ["eiha"],
  inlineSkills: [
    {
      kind: "attack",
      key: "canopic-golem-slam",
      name: "Slam",
      tagline: "The Canopic Golem slams its fist into a target twice.",
      description: "The Canopic Golem slams its fist into a target twice.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "strike", delivery: "physical", hits: 2 },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
          {
            band: "11-19",
            formula: [dice(1, 10), attr("st")],
            sideEffects: [],
          },
          {
            band: "20+",
            formula: [dice(1, 10), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
    {
      kind: "attack",
      key: "canopic-golem-dart",
      name: "Crystal Dart",
      tagline: "The Canopic Golem throws a crystal dart at a target.",
      description: "The Canopic Golem throws a crystal dart at a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      damage: { damageType: "pierce", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
          {
            band: "11-19",
            formula: [dice(1, 10), attr("st")],
            sideEffects: [],
          },
          {
            band: "20+",
            formula: [dice(1, 10), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
  ],
  talents: ["demolish"],
})

export const valinSarnaster = defineEnemy({
  key: "valin-sarnaster",
  level: 6,
  name: "Valin Sarnaster",
  maxHP: 96,
  attributes: { strength: 3, magic: 3, agility: 1, luck: 2 },
  affinities: {
    dark: "drain",
    slash: "null",
    pierce: "null",
    strike: "null",
    fire: "weak",
  },
  skillKeys: ["psi", "eiha", "evil-touch"],
  inlineSkills: [
    {
      kind: "attack",
      key: "rotting-fist",
      name: "Rotting Fist",
      tagline: "Valin Sarnaster throws a rotting fist at a target.",
      description: "Valin Sarnaster throws a rotting fist at a target.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "dark", delivery: "physical" },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [dice(1, 8), attr("st")], sideEffects: [] },
          {
            band: "11-19",
            formula: [dice(1, 12), attr("st")],
            sideEffects: [],
          },
          {
            band: "20+",
            formula: [dice(1, 12), attr("st")],
            sideEffects: ["critical", "despair"],
          },
        ],
      },
    },
    {
      kind: "ailment",
      key: "dreadful-glare",
      name: "Dreadful Glade",
      tagline: "Valin Sarnaster glares at a target with her dark glare.",
      description: "Valin Sarnaster glares at a target with her dark glare.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "same-or-adjacent-zone" },
      targets: "All",
      attackRoll: {
        attribute: "ma",
        tiers: [
          { band: "1-10", sideEffects: [] },
          { band: "11-19", sideEffects: ["fear"] },
          { band: "20+", sideEffects: ["fear", "confuse"] },
        ],
      },
    },
  ],
})

export const UNDEAD_ENEMIES = {
  shadow,
  zombie,
  mummy,
  "canopic-golem": canopicGolem,
  "valin-sarnaster": valinSarnaster,
} as const satisfies Record<string, Entity>
