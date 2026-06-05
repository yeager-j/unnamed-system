import type { Skill } from "../schema"
import { bufu } from "./bufu"

export const ICE_SKILLS = {
  bufu,
} as const satisfies Record<string, Skill>
