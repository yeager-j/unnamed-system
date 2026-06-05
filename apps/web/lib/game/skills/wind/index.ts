import type { Skill } from "../schema"
import { garu } from "./garu"
import { windblade } from "./windblade"

export const WIND_SKILLS = {
  windblade,
  garu,
} as const satisfies Record<string, Skill>
