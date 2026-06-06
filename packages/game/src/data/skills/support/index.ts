import { knightsProclamation } from "@workspace/game/data/skills/support/knights-proclamation"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SUPPORT_SKILLS = {
  "knights-proclamation": knightsProclamation,
} as const satisfies Record<string, Skill>
