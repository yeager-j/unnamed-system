import { elementalApocalypse } from "@workspace/game/data/skills/special/elemental-apocalypse"
import { grandHeist } from "@workspace/game/data/skills/special/grand-heist"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SPECIAL_SKILLS = {
  "elemental-apocalypse": elementalApocalypse,
  "grand-heist": grandHeist,
} as const satisfies Record<string, Skill>
