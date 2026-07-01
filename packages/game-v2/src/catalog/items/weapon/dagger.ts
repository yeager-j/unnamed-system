import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Item } from "@workspace/game-v2/items/item.schema"

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
          { band: "1-10", formula: F["1 + Ag"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + Ag"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + Ag"], sideEffects: ["critical"] },
        ],
      },
    },
  },
} satisfies Item
