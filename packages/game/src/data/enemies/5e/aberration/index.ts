import { intellectDevourer } from "@workspace/game/data/enemies/5e/aberration/intellect-devourer"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const ABERRATION_ENEMIES = {
  "intellect-devourer": intellectDevourer,
} as const satisfies Record<string, EnemyDefinition>
