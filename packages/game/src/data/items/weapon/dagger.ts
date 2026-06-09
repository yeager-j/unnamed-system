import type { Item } from "@workspace/game/foundation/items/schema"

export const dagger = {
  key: "dagger",
  name: "Dagger",
  description: "A light, concealable blade favored for quick, precise strikes.",
  stackSize: 1,
  equip: {
    slot: "weapon",
    intrinsicAttack: {
      range: { kind: "known", value: "engaged" },
      damageType: "pierce",
      delivery: "physical",
      attackRoll: {
        attribute: "ag",
        tiers: [
          { band: "1-10", formula: "1 + Ag", sideEffects: [] },
          { band: "11-19", formula: "1d6 + Ag", sideEffects: [] },
          { band: "20+", formula: "1d6 + Ag", sideEffects: ["critical"] },
        ],
      },
    },
  },
} satisfies Item
