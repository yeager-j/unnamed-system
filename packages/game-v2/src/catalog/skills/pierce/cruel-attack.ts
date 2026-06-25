import { F } from "@workspace/game-v2/catalog/skills/formulas"
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
      { band: "1-10", formula: F["1d6 + Ag"], sideEffects: [] },
      { band: "11-19", formula: F["1d10 + Ag"], sideEffects: [] },
      { band: "20+", formula: F["1d10 + Ag"], sideEffects: ["critical"] },
    ],
  },
  effect:
    "Deals an extra `1d6` damage to Downed enemies.\n\n**(Thief Only)** With 2+ Tells, you can inflict the target with **Dizzy**.",
} satisfies Skill
