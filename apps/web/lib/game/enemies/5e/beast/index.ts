import type { EnemyDefinition } from "../../schema"
import { wolf } from "./wolf"

export const BEAST_ENEMIES = {
  wolf,
} as const satisfies Record<string, EnemyDefinition>
