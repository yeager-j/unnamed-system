import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const cruelAttack = {
  kind: "attack",
  key: "cruel-attack",
  name: "Cruel Attack",
  tagline: "Weak single-target Pierce. Extra damage to Downed enemies.",
  description:
    "A weak **Pierce** attack targeting a single enemy. Extra damage to Downed enemies.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 10 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "pierce", delivery: "physical" },
  attackRoll: {
    attribute: "ag",
    tiers: [
      { band: "1-10", formula: [dice(1, 6), attr("ag")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("ag")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("ag")],
        sideEffects: ["critical"],
      },
    ],
  },
  effect:
    "Deals an extra `1d6` damage to Downed enemies.\n\n**(Thief Only)** With 2+ Tells, you can inflict the target with **Dizzy**.",
} satisfies Skill
