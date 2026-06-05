import type { Skill } from "../schema"
import { stormThrust } from "./storm-thrust"
import { zio } from "./zio"

export const ELEC_SKILLS = {
  "storm-thrust": stormThrust,
  zio,
} as const satisfies Record<string, Skill>
