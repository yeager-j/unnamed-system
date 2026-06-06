import { wolf } from "@workspace/game/data/enemies/5e/beast/wolf"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const BEAST_ENEMIES = {
  wolf,
} as const satisfies Record<string, EnemyDefinition>
