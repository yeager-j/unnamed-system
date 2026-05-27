import type { Weapon } from "../schema"

export const censer = {
  slot: "weapon",
  key: "censer",
  name: "Censer",
  description: "A weaponized censer.",
  intrinsicAttack: {
    range: { kind: "known", value: "engaged" },
    damageType: "strike",
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
