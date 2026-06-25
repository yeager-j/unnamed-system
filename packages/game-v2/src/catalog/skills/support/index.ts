import { knightsProclamation } from "@workspace/game-v2/catalog/skills/support/knights-proclamation"
import { rakukaja } from "@workspace/game-v2/catalog/skills/support/rakukaja"
import { sukukaja } from "@workspace/game-v2/catalog/skills/support/sukukaja"
import { tarukaja } from "@workspace/game-v2/catalog/skills/support/tarukaja"
import { warCry } from "@workspace/game-v2/catalog/skills/support/war-cry"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Support Skills, ported from v1 `data/skills/support/` into the composed shape. */
export const SUPPORT_SKILLS = {
  "knights-proclamation": knightsProclamation,
  tarukaja,
  rakukaja,
  sukukaja,
  "war-cry": warCry,
} as const satisfies Record<string, Skill>
