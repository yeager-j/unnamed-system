import type { EnemyDefinition } from "../../schema"
import { intellectDevourer } from "./intellect-devourer"

export const ABERRATION_ENEMIES = {
  "intellect-devourer": intellectDevourer,
} as const satisfies Record<string, EnemyDefinition>
