import { memoryBlow } from "@workspace/game/data/skills/psy/memory-blow"
import { psi } from "@workspace/game/data/skills/psy/psi"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const PSY_SKILLS = {
  psi,
  "memory-blow": memoryBlow,
} as const satisfies Record<string, Skill>
