import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const peerlessStonecleaver = {
  kind: "attack",
  key: "peerless-stonecleaver",
  name: "Peerless Stonecleaver",
  tagline: "Severe Slash to one enemy. Extra turn at Perfection S.",
  description: "Deals severe **Slash** damage to one enemy.",
  isSynthesis: true,
  cost: { kind: "hp-percent", amount: 20 },
  range: { kind: "known", value: "engaged" },
  damage: { damageType: "slash", delivery: "physical" },
  formula: "12d10",
  effect:
    "**(Warrior Only)** If your **Perfection** is S, immediately take an additional turn.",
} satisfies Skill
