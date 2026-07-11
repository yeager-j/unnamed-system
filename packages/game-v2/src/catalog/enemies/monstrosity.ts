import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { attr, dice, flat } from "@workspace/game-v2/combat/formula"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const doppelganger = defineEnemy({
  key: "doppelganger",
  level: 5,
  name: "Doppelganger",
  maxHP: 60,
  attributes: { strength: 3, magic: -1, agility: 2, luck: 1 },
  affinities: { strike: "resist", elec: "weak", mind: "null" },
  skillKeys: ["psi"],
  inlineSkills: [
    {
      kind: "attack",
      key: "doppelganger-slam",
      name: "Slam",
      tagline: "The Doppelganger slams its fist into a target twice.",
      description: "The Doppelganger slams its fist into a target twice.",
      isSynthesis: false,
      cost: { kind: "sp", amount: 1 },
      range: { kind: "known", value: "engaged" },
      damage: { damageType: "strike", delivery: "physical", hits: 2 },
      attackRoll: {
        attribute: "st",
        tiers: [
          { band: "1-10", formula: [flat(1), attr("st")], sideEffects: [] },
          { band: "11-19", formula: [dice(1, 6), attr("st")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 6), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
    {
      kind: "passive",
      key: "doppelganger-ambusher",
      name: "Ambusher",
      tagline:
        "Cannot be Ambushed; a foe's successful Ambush yields a neutral encounter.",
      description:
        "Cannot be Ambushed; a successful Ambush by the opposing side results in a neutral combat encounter.",
      isSynthesis: false,
    },
    {
      kind: "passive",
      key: "doppelganger-surprise-attack",
      name: "Surprise Attack",
      tagline: "Deals an extra 2d8 damage during an Ambush round.",
      description:
        "During an Ambush round, weapons and Skills deal an additional `2d8` damage.",
      isSynthesis: false,
    },
  ],
  talents: ["lie", "interrogate"],
})

export const MONSTROSITY_ENEMIES = {
  doppelganger,
} as const satisfies Record<string, Entity>
