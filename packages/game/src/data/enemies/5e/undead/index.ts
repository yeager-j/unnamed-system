import { canopicGolem } from "@workspace/game/data/enemies/5e/undead/canopic-golem"
import { mummy } from "@workspace/game/data/enemies/5e/undead/mummy"
import { shadow } from "@workspace/game/data/enemies/5e/undead/shadow"
import { valinSarnaster } from "@workspace/game/data/enemies/5e/undead/valin-sarnaster"
import { zombie } from "@workspace/game/data/enemies/5e/undead/zombie"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const UNDEAD_ENEMIES = {
  shadow,
  zombie,
  mummy,
  "canopic-golem": canopicGolem,
  "valin-sarnaster": valinSarnaster,
} as const satisfies Record<string, EnemyDefinition>
