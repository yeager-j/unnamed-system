import { agi } from "@workspace/game/data/skills/fire/agi"
import { bladeOfFire } from "@workspace/game/data/skills/fire/blade-of-fire"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const FIRE_SKILLS = {
  agi,
  "blade-of-fire": bladeOfFire,
} as const satisfies Record<string, Skill>
