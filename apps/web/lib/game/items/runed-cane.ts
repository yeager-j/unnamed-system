import type { Weapon } from "./schema"

export const runedCane = {
  slot: "weapon",
  key: "runed-cane",
  name: "Runed Cane",
  description:
    "A lacquered cane inlaid with focusing runes that sharpen the wielder's spellcraft, granting +1 Magic.",
  intrinsicAttack: {
    range: { kind: "known", value: "engaged" },
    damageType: "strike",
    delivery: "physical",
    attackRoll: {
      attribute: "st",
      tiers: [
        { band: "1-10", formula: "1 + St", sideEffects: [] },
        { band: "11-19", formula: "1d4 + St", sideEffects: [] },
        { band: "20+", formula: "1d4 + St", sideEffects: ["Critical"] },
      ],
    },
  },
  effects: [{ type: "attribute", target: "magic", amount: 1 }],
} satisfies Weapon
