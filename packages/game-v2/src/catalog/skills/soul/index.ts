import { spiritBreak } from "@workspace/game-v2/catalog/skills/soul/spirit-break"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Soul Skills, ported from v1 `data/skills/soul/` into the composed shape. */
export const SOUL_SKILLS = {
  "spirit-break": spiritBreak,
} as const satisfies Record<string, Skill>
