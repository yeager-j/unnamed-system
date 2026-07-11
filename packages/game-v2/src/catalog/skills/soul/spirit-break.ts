import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const spiritBreak = {
  kind: "attack",
  key: "spirit-break",
  name: "Spirit Break",
  tagline: "Weak single-target Soul. No-Cure on a 20+.",
  description: "Deals weak **Soul** damage to one enemy.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "soul", delivery: "physical" },
  attackRoll: {
    attribute: "st",
    tiers: [
      { band: "1-10", formula: [dice(1, 6), attr("st")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 10), attr("st")], sideEffects: [] },
      {
        band: "20+",
        formula: [dice(1, 10), attr("st")],
        sideEffects: ["no-cure"],
      },
    ],
  },
  effect:
    "**(Berserker/Frenzy Mode)** On a **`20+`**, also inflicts *Despair*.",
} satisfies Skill
