import { bladeOfWind } from "@workspace/game/data/skills/wind/blade-of-wind"
import { garu } from "@workspace/game/data/skills/wind/garu"
import { windblade } from "@workspace/game/data/skills/wind/windblade"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const WIND_SKILLS = {
  windblade,
  garu,
  "blade-of-wind": bladeOfWind,
} as const satisfies Record<string, Skill>
