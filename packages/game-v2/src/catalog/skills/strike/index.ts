import { bash } from "@workspace/game-v2/catalog/skills/strike/bash"
import { flashBomb } from "@workspace/game-v2/catalog/skills/strike/flash-bomb"
import { rampage } from "@workspace/game-v2/catalog/skills/strike/rampage"
import { shieldArts } from "@workspace/game-v2/catalog/skills/strike/shield-arts"
import { wantonDestruction } from "@workspace/game-v2/catalog/skills/strike/wanton-destruction"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Strike Skills, ported from v1 `data/skills/strike/` into the composed shape. */
export const STRIKE_SKILLS = {
  "shield-arts": shieldArts,
  "flash-bomb": flashBomb,
  bash,
  rampage,
  "wanton-destruction": wantonDestruction,
} as const satisfies Record<string, Skill>
