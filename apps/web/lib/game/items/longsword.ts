import type { Weapon } from "./schema"

export const longsword = {
  slot: "weapon",
  key: "longsword",
  name: "Longsword",
  description: "A standard one-handed blade.",
  intrinsicAttack: {
    range: { kind: "known", value: "engaged" },
    damageType: "slash",
    delivery: "physical",
    attackRoll: {
      attribute: "st",
      tiers: [
        { band: "1-10", formula: "1 + St", sideEffects: [] },
        { band: "11-19", formula: "1d6 + St", sideEffects: [] },
        { band: "20+", formula: "1d6 + St", sideEffects: ["Critical"] },
      ],
    },
  },
} satisfies Weapon
