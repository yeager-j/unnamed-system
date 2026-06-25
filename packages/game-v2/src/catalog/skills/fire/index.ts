import { agi } from "@workspace/game-v2/catalog/skills/fire/agi"
import { bladeOfFire } from "@workspace/game-v2/catalog/skills/fire/blade-of-fire"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Fire Skills, ported from v1 `data/skills/fire/` into the composed shape. */
export const FIRE_SKILLS = {
  agi,
  "blade-of-fire": bladeOfFire,
} as const satisfies Record<string, Skill>
