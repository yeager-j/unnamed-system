import type { Skill } from "../schema"
import { doorToHades } from "./door-to-hades"
import { eiha } from "./eiha"

export const DARK_SKILLS = {
  eiha,
  "door-to-hades": doorToHades,
} as const satisfies Record<string, Skill>
