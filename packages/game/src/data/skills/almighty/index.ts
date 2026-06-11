import { cantata } from "@workspace/game/data/skills/almighty/cantata"
import { showtime } from "@workspace/game/data/skills/almighty/showtime"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const ALMIGHTY_SKILLS = {
  cantata,
  showtime,
} as const satisfies Record<string, Skill>
