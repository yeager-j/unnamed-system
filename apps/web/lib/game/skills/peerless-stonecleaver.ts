import type { Skill } from "./schema"

export const peerlessStonecleaver = {
  kind: "attack",
  key: "peerless-stonecleaver",
  name: "Peerless Stonecleaver",
  description: "Deals severe slash damage to one enemy.",
  archetypeKey: "warrior",
  isSynthesis: true,
  cost: { kind: "hp-percent", amount: 20 },
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  damage: "12d10",
  effect:
    "(Warrior Only) If your Perfection is S, immediately take an additional turn.",
} satisfies Skill
