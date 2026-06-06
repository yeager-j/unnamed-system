import { doppelganger } from "@workspace/game/data/enemies/5e/monstrosity/doppelganger"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const MONSTROSITY_ENEMIES = {
  doppelganger,
} as const satisfies Record<string, EnemyDefinition>
