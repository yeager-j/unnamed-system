import { evilTouch } from "@workspace/game-v2/catalog/skills/ailment/evil-touch"
import { makajam } from "@workspace/game-v2/catalog/skills/ailment/makajam"
import { pulpina } from "@workspace/game-v2/catalog/skills/ailment/pulpina"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Ailment Skills, ported from v1 `data/skills/ailment/` into the composed shape. */
export const AILMENT_SKILLS = {
  "evil-touch": evilTouch,
  pulpina,
  makajam,
} as const satisfies Record<string, Skill>
