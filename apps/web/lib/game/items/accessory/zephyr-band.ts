import type { Accessory } from "../schema"

export const zephyrBand = {
  slot: "accessory",
  key: "zephyr-band",
  name: "Zephyr Band",
  description:
    "A circlet humming with bound wind that teaches its wearer the Garu spell.",
  effects: [{ type: "skill", skillKey: "garu" }],
} satisfies Accessory
