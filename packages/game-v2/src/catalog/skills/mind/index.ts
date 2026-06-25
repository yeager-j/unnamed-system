import { memoryBlow } from "@workspace/game-v2/catalog/skills/mind/memory-blow"
import { psi } from "@workspace/game-v2/catalog/skills/mind/psi"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Mind Skills, ported from v1 `data/skills/mind/` into the composed shape. */
export const MIND_SKILLS = {
  psi,
  "memory-blow": memoryBlow,
} as const satisfies Record<string, Skill>
