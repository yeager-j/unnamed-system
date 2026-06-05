import type { Skill } from "../schema"
import { shieldArts } from "./shield-arts"

export const STRIKE_SKILLS = {
  "shield-arts": shieldArts,
} as const satisfies Record<string, Skill>
