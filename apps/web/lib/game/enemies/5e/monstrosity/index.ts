import type { EnemyDefinition } from "../../schema"
import { doppelganger } from "./doppelganger"

export const MONSTROSITY_ENEMIES = {
  doppelganger,
} as const satisfies Record<string, EnemyDefinition>
