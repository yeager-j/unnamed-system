import type { Armor } from "../schema"

export const bladeturnMail = {
  slot: "armor",
  key: "bladeturn-mail",
  name: "Bladeturn Mail",
  description:
    "Overlapping scales angled to glance blades aside, granting Resist to Slash.",
  effects: [{ type: "affinity", damageTypes: ["slash"], affinity: "resist" }],
} satisfies Armor
