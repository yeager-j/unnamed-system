import type { EnemyDefinition } from "../../schema"
import { shadow } from "./shadow"

export const UNDEAD_ENEMIES = {
  shadow,
} as const satisfies Record<string, EnemyDefinition>
