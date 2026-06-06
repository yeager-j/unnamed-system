import { divineJudgment } from "@workspace/game/data/skills/light/divine-judgment"
import { kouha } from "@workspace/game/data/skills/light/kouha"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const LIGHT_SKILLS = {
  kouha,
  "divine-judgment": divineJudgment,
} as const satisfies Record<string, Skill>
