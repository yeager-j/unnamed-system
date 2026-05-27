import type { Armor } from "../schema"

export const warlockPact = {
  slot: "armor",
  key: "warlock-pact",
  name: "Warlock's Pact",
  description:
    "A braided cord of black hair and silvered wire, sworn at a crossroads to a hexworker who never gave her name. The wearer learns the **Ailment Boost** passive — every hex they lay lands harder when another warlock walks beside them.",
  effects: [{ type: "skill", skillKey: "ailment-boost" }],
} satisfies Armor
