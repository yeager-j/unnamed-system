import type { Skill } from "../schema"
import { elementalApocalypse } from "./elemental-apocalypse"

export const SPECIAL_SKILLS = {
  "elemental-apocalypse": elementalApocalypse,
} as const satisfies Record<string, Skill>
