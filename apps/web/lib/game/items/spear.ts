import type { Weapon } from "./schema"

export const spear = {
  slot: "weapon",
  key: "spear",
  name: "Spear",
  description: "A standard two-handed spear.",
  intrinsicAttack: {
    range: { kind: "known", value: "engaged" },
    damageType: "pierce",
    delivery: "physical",
    attackRoll: {
      attribute: "st",
      tiers: [
        { band: "1-10", formula: "1 + St", sideEffects: [] },
        { band: "11-19", formula: "1d6 + St", sideEffects: [] },
        { band: "20+", formula: "1d6 + St", sideEffects: ["critical"] },
      ],
    },
  },
} satisfies Weapon
