import { knightsProclamation } from "@workspace/game/data/skills/support/knights-proclamation"
import { rakukaja } from "@workspace/game/data/skills/support/rakukaja"
import { sukukaja } from "@workspace/game/data/skills/support/sukukaja"
import { tarukaja } from "@workspace/game/data/skills/support/tarukaja"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SUPPORT_SKILLS = {
  "knights-proclamation": knightsProclamation,
  tarukaja,
  rakukaja,
  sukukaja,
} as const satisfies Record<string, Skill>
