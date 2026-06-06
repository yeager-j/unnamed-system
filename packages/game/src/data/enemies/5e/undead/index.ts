import { shadow } from "@workspace/game/data/enemies/5e/undead/shadow"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const UNDEAD_ENEMIES = {
  shadow,
} as const satisfies Record<string, EnemyDefinition>
