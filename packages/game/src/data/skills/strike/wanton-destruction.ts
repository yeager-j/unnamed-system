import type { Skill } from "@workspace/game/foundation/skills/schema"

export const wantonDestruction = {
  kind: "attack",
  key: "wanton-destruction",
  name: "Wanton Destruction",
  tagline: "Severe single-target Strike. Berserker Synthesis Skill.",
  description: "Deals severe **Strike** damage to one enemy.",
  isSynthesis: true,
  cost: { kind: "hp-percent", amount: 20 },
  range: { kind: "known", value: "engaged" },
  damageType: "strike",
  delivery: "physical",
  damage: "12d10",
  effect:
    "**(Berserker/Frenzy Mode)** Range becomes **Same Zone** and gains Targets: **All**.",
} satisfies Skill
