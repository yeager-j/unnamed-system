import { attr, dice, flat } from "@workspace/game-v2/combat/formula"
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
          { band: "1-10", formula: [flat(1), attr("ag")], sideEffects: [] },
          { band: "11-19", formula: [dice(1, 6), attr("ag")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 6), attr("ag")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
  },
} satisfies Item
