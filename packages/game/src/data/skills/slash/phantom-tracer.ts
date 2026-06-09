import type { Skill } from "@workspace/game/foundation/skills/schema"

export const phantomTracer = {
  kind: "attack",
  key: "phantom-tracer",
  name: "Phantom Tracer",
  tagline: "Severe Slash to one enemy. Steals all of their buffs.",
  description:
    "Deals severe **Slash** damage to one enemy and steals all of their buffs.",
  isSynthesis: true,
  cost: { kind: "hp-percent", amount: 20 },
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  damage: "12d10",
  effect:
    "If any of the enemy's stats are increased (Attack, Defense, Hit/Evasion), your respective stat(s) are increased and the enemy's are set to neutral.\n\n**(Thief Only)** With 1+ Tells, the target's previously increased stats are decreased instead of being set to neutral, and the DM does not roll for Suspicion.",
} satisfies Skill
