import { divineJudgment } from "@workspace/game-v2/catalog/skills/light/divine-judgment"
import { kouha } from "@workspace/game-v2/catalog/skills/light/kouha"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Light Skills, ported from v1 `data/skills/light/` into the composed shape. */
export const LIGHT_SKILLS = {
  kouha,
  "divine-judgment": divineJudgment,
} as const satisfies Record<string, Skill>
