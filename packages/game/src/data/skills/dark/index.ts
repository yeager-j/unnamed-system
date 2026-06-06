import { doorToHades } from "@workspace/game/data/skills/dark/door-to-hades"
import { eiha } from "@workspace/game/data/skills/dark/eiha"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const DARK_SKILLS = {
  eiha,
  "door-to-hades": doorToHades,
} as const satisfies Record<string, Skill>
