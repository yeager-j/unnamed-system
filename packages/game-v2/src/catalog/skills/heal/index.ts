import { amritaDrop } from "@workspace/game-v2/catalog/skills/heal/amrita-drop"
import { dia } from "@workspace/game-v2/catalog/skills/heal/dia"
import { media } from "@workspace/game-v2/catalog/skills/heal/media"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Heal Skills, ported from v1 `data/skills/heal/` into the composed shape. */
export const HEAL_SKILLS = {
  dia,
  media,
  "amrita-drop": amritaDrop,
} as const satisfies Record<string, Skill>
