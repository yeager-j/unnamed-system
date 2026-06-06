import { bufu } from "@workspace/game/data/skills/ice/bufu"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const ICE_SKILLS = {
  bufu,
} as const satisfies Record<string, Skill>
