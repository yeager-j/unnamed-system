import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const bash = {
  kind: "attack",
  key: "bash",
  name: "Bash",
  tagline: "Weak single-target Strike. Crits on a 20+.",
  description: "A weak **Strike** attack targeting a single enemy.",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount: 5 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "strike", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("st")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("st")],
        sideEffects: ["critical"],
      },
    ],
  },
  effect: "**(Berserker/Frenzy Mode)** *Critical* becomes *Auto-Critical*.",
} satisfies Skill
