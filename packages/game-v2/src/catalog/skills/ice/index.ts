import { bladeOfIce } from "@workspace/game-v2/catalog/skills/ice/blade-of-ice"
import { bufu } from "@workspace/game-v2/catalog/skills/ice/bufu"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Ice Skills, ported from v1 `data/skills/ice/` into the composed shape. */
export const ICE_SKILLS = {
  bufu,
  "blade-of-ice": bladeOfIce,
} as const satisfies Record<string, Skill>
