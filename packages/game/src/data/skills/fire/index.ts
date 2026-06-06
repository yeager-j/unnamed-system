import { agi } from "@workspace/game/data/skills/fire/agi"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const FIRE_SKILLS = {
  agi,
} as const satisfies Record<string, Skill>
