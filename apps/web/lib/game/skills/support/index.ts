import type { Skill } from "../schema"
import { knightsProclamation } from "./knights-proclamation"

export const SUPPORT_SKILLS = {
  "knights-proclamation": knightsProclamation,
} as const satisfies Record<string, Skill>
