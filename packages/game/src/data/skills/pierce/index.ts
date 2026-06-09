import { cruelAttack } from "@workspace/game/data/skills/pierce/cruel-attack"
import { feint } from "@workspace/game/data/skills/pierce/feint"
import { hammerOfJustice } from "@workspace/game/data/skills/pierce/hammer-of-justice"
import { skewer } from "@workspace/game/data/skills/pierce/skewer"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const PIERCE_SKILLS = {
  skewer,
  "hammer-of-justice": hammerOfJustice,
  feint,
  "cruel-attack": cruelAttack,
} as const satisfies Record<string, Skill>
