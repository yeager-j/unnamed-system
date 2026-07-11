import { attr, dice, flat } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const tempestSlash = {
  kind: "attack",
  key: "tempest-slash",
  name: "Tempest Slash",
  tagline: "Three Slash hits on one enemy. Crits on a 20+.",
  description: "A series of **Slash** attacks targeting one enemy.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 15 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "slash", delivery: "physical", hits: 3 },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: [flat(1), attr("st")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 4), attr("st")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 4), attr("st")],
        sideEffects: ["critical"],
      },
    ],
  },
  effect:
    "**(Warrior Only)** If your **Perfection** is S, each hit deals an additional `1d4` **Slash** damage.",
} satisfies Skill
