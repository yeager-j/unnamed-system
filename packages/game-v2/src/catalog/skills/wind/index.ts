import { bladeOfWind } from "@workspace/game-v2/catalog/skills/wind/blade-of-wind"
import { garu } from "@workspace/game-v2/catalog/skills/wind/garu"
import { windblade } from "@workspace/game-v2/catalog/skills/wind/windblade"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Wind Skills, ported from v1 `data/skills/wind/` into the composed shape. */
export const WIND_SKILLS = {
  windblade,
  garu,
  "blade-of-wind": bladeOfWind,
} as const satisfies Record<string, Skill>
