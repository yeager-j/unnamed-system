import { spiritBreak } from "@workspace/game/data/skills/soul/spirit-break"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SOUL_SKILLS = {
  "spirit-break": spiritBreak,
} as const satisfies Record<string, Skill>
