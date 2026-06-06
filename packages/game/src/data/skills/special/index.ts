import { elementalApocalypse } from "@workspace/game/data/skills/special/elemental-apocalypse"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SPECIAL_SKILLS = {
  "elemental-apocalypse": elementalApocalypse,
} as const satisfies Record<string, Skill>
