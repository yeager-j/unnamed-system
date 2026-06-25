import { cleave } from "@workspace/game-v2/catalog/skills/slash/cleave"
import { criticalStrike } from "@workspace/game-v2/catalog/skills/slash/critical-strike"
import { peerlessStonecleaver } from "@workspace/game-v2/catalog/skills/slash/peerless-stonecleaver"
import { phantomTracer } from "@workspace/game-v2/catalog/skills/slash/phantom-tracer"
import { tempestSlash } from "@workspace/game-v2/catalog/skills/slash/tempest-slash"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Slash Skills, ported from v1 `data/skills/slash/` into the composed shape. */
export const SLASH_SKILLS = {
  cleave,
  "tempest-slash": tempestSlash,
  "critical-strike": criticalStrike,
  "peerless-stonecleaver": peerlessStonecleaver,
  "phantom-tracer": phantomTracer,
} as const satisfies Record<string, Skill>
