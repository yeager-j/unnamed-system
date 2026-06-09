import { flashBomb } from "@workspace/game/data/skills/strike/flash-bomb"
import { shieldArts } from "@workspace/game/data/skills/strike/shield-arts"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const STRIKE_SKILLS = {
  "shield-arts": shieldArts,
  "flash-bomb": flashBomb,
} as const satisfies Record<string, Skill>
