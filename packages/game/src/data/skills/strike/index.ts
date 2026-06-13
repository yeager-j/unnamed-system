import { bash } from "@workspace/game/data/skills/strike/bash"
import { flashBomb } from "@workspace/game/data/skills/strike/flash-bomb"
import { rampage } from "@workspace/game/data/skills/strike/rampage"
import { shieldArts } from "@workspace/game/data/skills/strike/shield-arts"
import { wantonDestruction } from "@workspace/game/data/skills/strike/wanton-destruction"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const STRIKE_SKILLS = {
  "shield-arts": shieldArts,
  "flash-bomb": flashBomb,
  bash,
  rampage,
  "wanton-destruction": wantonDestruction,
} as const satisfies Record<string, Skill>
