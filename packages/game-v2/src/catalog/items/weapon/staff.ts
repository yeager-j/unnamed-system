import { attr, dice, flat } from "@workspace/game-v2/combat/formula"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const staff = {
  key: "staff",
  name: "Staff",
  description: "A standard two-handed staff.",
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
          { band: "1-10", formula: [flat(1), attr("st")], sideEffects: [] },
          { band: "11-19", formula: [dice(1, 6), attr("st")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 6), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
  },
} satisfies Item
