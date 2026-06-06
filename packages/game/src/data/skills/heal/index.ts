import { amritaDrop } from "@workspace/game/data/skills/heal/amrita-drop"
import { dia } from "@workspace/game/data/skills/heal/dia"
import { media } from "@workspace/game/data/skills/heal/media"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const HEAL_SKILLS = {
  dia,
  media,
  "amrita-drop": amritaDrop,
} as const satisfies Record<string, Skill>
