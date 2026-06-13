import type { Item } from "@workspace/game/foundation/items/schema"

export const greataxe = {
  key: "greataxe",
  name: "Greataxe",
  description: "A heavy two-handed axe built for raw, reckless force.",
  stackSize: 1,
  equip: {
    slot: "weapon",
    intrinsicAttack: {
      range: { kind: "known", value: "engaged" },
      damageType: "slash",
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
  },
} satisfies Item
