import { F } from "@workspace/game-v2/catalog/skills/formulas"
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
          { band: "1-10", formula: F["1 + St"], sideEffects: [] },
          { band: "11-19", formula: F["1d4 + St"], sideEffects: [] },
          { band: "20+", formula: F["1d4 + St"], sideEffects: ["critical"] },
        ],
      },
    },
    effects: [{ type: "attribute", target: "magic", amount: 1 }],
  },
} satisfies Item
