import type { Skill } from "@workspace/game/foundation/skills/schema"

export const doorToHades = {
  kind: "attack",
  key: "door-to-hades",
  name: "Door to Hades",
  tagline: "Kills enemies inflicted with an Ailment.",
  description:
    "*Auto-Insta-Kill (Dark)* to each enemy inflicted with an Ailment.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 20 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  targets: "All Enemies",
  damageType: "dark",
  delivery: "magical",
} satisfies Skill
