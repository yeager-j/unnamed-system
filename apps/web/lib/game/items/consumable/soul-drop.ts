import type { Item } from "../schema"

export const soulDrop = {
  key: "soul-drop",
  name: "Soul Drop",
  description: "Restores 10 SP.",
  stackSize: 999,
  consumable: true,
} satisfies Item
