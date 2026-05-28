import type { Item } from "../schema"

export const zephyrBand = {
  key: "zephyr-band",
  name: "Zephyr Band",
  description:
    "A circlet humming with bound wind that teaches its wearer the Garu spell.",
  stackSize: 1,
  equip: {
    slot: "accessory",
    effects: [{ type: "skill", skillKey: "garu" }],
  },
} satisfies Item
