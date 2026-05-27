import type { Accessory } from "../schema"

export const shadowCharm = {
  slot: "accessory",
  key: "shadow-charm",
  name: "Shadow Charm",
  description:
    "A blackened obsidian token that whispers in the wearer's voice, teaching the Evil Touch incantation.",
  effects: [{ type: "skill", skillKey: "evil-touch" }],
} satisfies Accessory
