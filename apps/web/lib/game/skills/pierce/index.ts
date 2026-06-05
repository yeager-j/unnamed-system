import type { Skill } from "../schema"
import { hammerOfJustice } from "./hammer-of-justice"
import { skewer } from "./skewer"

export const PIERCE_SKILLS = {
  skewer,
  "hammer-of-justice": hammerOfJustice,
} as const satisfies Record<string, Skill>
