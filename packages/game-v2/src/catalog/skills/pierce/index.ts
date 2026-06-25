import { cruelAttack } from "@workspace/game-v2/catalog/skills/pierce/cruel-attack"
import { feint } from "@workspace/game-v2/catalog/skills/pierce/feint"
import { hammerOfJustice } from "@workspace/game-v2/catalog/skills/pierce/hammer-of-justice"
import { skewer } from "@workspace/game-v2/catalog/skills/pierce/skewer"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Pierce Skills, ported from v1 `data/skills/pierce/` into the composed shape. */
export const PIERCE_SKILLS = {
  skewer,
  "hammer-of-justice": hammerOfJustice,
  feint,
  "cruel-attack": cruelAttack,
} as const satisfies Record<string, Skill>
