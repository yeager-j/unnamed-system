import { attr, dice, flat } from "@workspace/game-v2/combat/formula"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const runedCane = {
  key: "runed-cane",
  name: "Runed Cane",
  description:
    "A lacquered cane inlaid with focusing runes that sharpen the wielder's spellcraft, granting +1 Magic.",
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
          { band: "11-19", formula: [dice(1, 4), attr("st")], sideEffects: [] },
          {
            band: "20+",
            formula: [dice(1, 4), attr("st")],
            sideEffects: ["critical"],
          },
        ],
      },
    },
    effects: [{ type: "attribute", target: "magic", amount: 1 }],
  },
} satisfies Item
