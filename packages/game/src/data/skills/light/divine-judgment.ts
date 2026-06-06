import type { Skill } from "@workspace/game/foundation/skills/schema"

export const divineJudgment = {
  kind: "attack",
  key: "divine-judgment",
  name: "Divine Judgment",
  tagline: "Severe Light damage to all enemies; applies Lumina.",
  description:
    "Deals severe **Light** damage to all enemies and applies **Lumina**.",
  isSynthesis: true,
  cost: { kind: "sp", amount: 20 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "light",
  delivery: "magical",
  damage: "10d8",
  targets: "All Enemies",
  effect:
    "Each enemy that takes this damage gains **Lumina** equal to your **Luck**. The next **Healing** or **Support** Skill you use before combat ends costs 0 SP.",
} satisfies Skill
