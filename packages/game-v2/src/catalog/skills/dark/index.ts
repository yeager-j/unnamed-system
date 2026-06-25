import { doorToHades } from "@workspace/game-v2/catalog/skills/dark/door-to-hades"
import { eiha } from "@workspace/game-v2/catalog/skills/dark/eiha"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Dark Skills, ported from v1 `data/skills/dark/` into the composed shape. */
export const DARK_SKILLS = {
  eiha,
  "door-to-hades": doorToHades,
} as const satisfies Record<string, Skill>
