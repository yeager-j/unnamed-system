import { bladeOfIce } from "@workspace/game/data/skills/ice/blade-of-ice"
import { bufu } from "@workspace/game/data/skills/ice/bufu"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const ICE_SKILLS = {
  bufu,
  "blade-of-ice": bladeOfIce,
} as const satisfies Record<string, Skill>
