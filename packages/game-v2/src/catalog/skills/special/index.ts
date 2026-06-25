import { elementalApocalypse } from "@workspace/game-v2/catalog/skills/special/elemental-apocalypse"
import { grandHeist } from "@workspace/game-v2/catalog/skills/special/grand-heist"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Special Skills, ported from v1 `data/skills/special/` into the composed shape. */
export const SPECIAL_SKILLS = {
  "elemental-apocalypse": elementalApocalypse,
  "grand-heist": grandHeist,
} as const satisfies Record<string, Skill>
