import { attr, dice } from "@workspace/game-v2/combat/formula"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const cantata = {
  kind: "attack",
  key: "cantata",
  name: "Cantata",
  tagline:
    "Weak single-target Almighty. Effects change with the Zone's Enchantment.",
  description:
    "Weak **Almighty** damage to a single target. Effects change depending on the Zone's Enchantment.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 4 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: { damageType: "almighty", delivery: "magical" },
  attackRoll: {
    attribute: "ma",
    tiers: [
      { band: "1-10", formula: [dice(1, 4), attr("ma")], sideEffects: [] },
      { band: "11-19", formula: [dice(1, 8), attr("ma")], sideEffects: [] },
      { band: "20+", formula: [dice(1, 12), attr("ma")], sideEffects: [] },
    ],
  },
  effect:
    "**(Bard Only)** If the target occupies an Enchanted Zone, gain a bonus to your Attack Roll equal to the Zone's Forte. Additionally:\n\n- **Toccata:** **`20+`** *Rage*\n- **Requiem:** Choose one ally in the same Zone as the target; they regain HP equal to half the damage dealt.\n- **Tarantella:** **`20+`** *Target cannot Move until the end of their next turn*",
} satisfies Skill
