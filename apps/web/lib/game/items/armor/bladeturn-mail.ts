import type { Item } from "../schema"

export const bladeturnMail = {
  key: "bladeturn-mail",
  name: "Bladeturn Mail",
  description:
    "Overlapping scales angled to glance blades aside, granting Resist to Slash.",
  stackSize: 1,
  equip: {
    slot: "armor",
    effects: [{ type: "affinity", damageTypes: ["slash"], affinity: "resist" }],
  },
} satisfies Item
