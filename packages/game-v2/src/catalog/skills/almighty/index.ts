import { cantata } from "@workspace/game-v2/catalog/skills/almighty/cantata"
import { showtime } from "@workspace/game-v2/catalog/skills/almighty/showtime"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Almighty Skills, ported from v1 `data/skills/almighty/` into the composed shape. */
export const ALMIGHTY_SKILLS = {
  cantata,
  showtime,
} as const satisfies Record<string, Skill>
