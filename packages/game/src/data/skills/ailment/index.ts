import { evilTouch } from "@workspace/game/data/skills/ailment/evil-touch"
import { makajam } from "@workspace/game/data/skills/ailment/makajam"
import { pulpina } from "@workspace/game/data/skills/ailment/pulpina"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const AILMENT_SKILLS = {
  "evil-touch": evilTouch,
  pulpina,
  makajam,
} as const satisfies Record<string, Skill>
