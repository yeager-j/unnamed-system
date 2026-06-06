import { psi } from "@workspace/game/data/skills/psy/psi"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const PSY_SKILLS = {
  psi,
} as const satisfies Record<string, Skill>
