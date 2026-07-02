import { F } from "@workspace/game-v2/catalog/skills/formulas"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const lute = {
  key: "lute",
  name: "Lute",
  description: "A sturdy lute, as ready to crack a skull as carry a tune.",
  stackSize: 1,
  equip: {
    slot: "weapon",
    intrinsicAttack: {
      range: { kind: "known", value: "engaged" },
      damageType: "strike",
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
