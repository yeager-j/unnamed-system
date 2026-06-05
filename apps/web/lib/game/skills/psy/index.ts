import type { Skill } from "../schema"
import { psi } from "./psi"

export const PSY_SKILLS = {
  psi,
} as const satisfies Record<string, Skill>
