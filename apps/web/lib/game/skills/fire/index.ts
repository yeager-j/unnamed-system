import type { Skill } from "../schema"
import { agi } from "./agi"

export const FIRE_SKILLS = {
  agi,
} as const satisfies Record<string, Skill>
