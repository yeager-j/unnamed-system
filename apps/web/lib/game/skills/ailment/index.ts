import type { Skill } from "../schema"
import { evilTouch } from "./evil-touch"
import { makajam } from "./makajam"
import { pulpina } from "./pulpina"

export const AILMENT_SKILLS = {
  "evil-touch": evilTouch,
  pulpina,
  makajam,
} as const satisfies Record<string, Skill>
