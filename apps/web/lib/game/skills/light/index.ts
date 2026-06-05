import type { Skill } from "../schema"
import { divineJudgment } from "./divine-judgment"
import { kouha } from "./kouha"

export const LIGHT_SKILLS = {
  kouha,
  "divine-judgment": divineJudgment,
} as const satisfies Record<string, Skill>
