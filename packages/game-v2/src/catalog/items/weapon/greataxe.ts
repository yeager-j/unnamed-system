import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Item } from "@workspace/game-v2/items/item.schema"

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
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d6 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d6 + St"], sideEffects: ["critical"] },
        ],
      },
    },
  },
} satisfies Item
