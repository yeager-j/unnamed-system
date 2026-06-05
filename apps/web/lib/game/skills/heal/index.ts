import type { Skill } from "../schema"
import { amritaDrop } from "./amrita-drop"
import { dia } from "./dia"
import { media } from "./media"

export const HEAL_SKILLS = {
  dia,
  media,
  "amrita-drop": amritaDrop,
} as const satisfies Record<string, Skill>
