import { dao } from "@workspace/game/data/enemies/5e/elemental/dao"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const ELEMENTAL_ENEMIES = {
  dao,
} as const satisfies Record<string, EnemyDefinition>
