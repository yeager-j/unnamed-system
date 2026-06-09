import { memoryBlow } from "@workspace/game/data/skills/mind/memory-blow"
import { psi } from "@workspace/game/data/skills/mind/psi"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const MIND_SKILLS = {
  psi,
  "memory-blow": memoryBlow,
} as const satisfies Record<string, Skill>
