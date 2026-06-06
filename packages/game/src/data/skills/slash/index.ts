import { cleave } from "@workspace/game/data/skills/slash/cleave"
import { criticalStrike } from "@workspace/game/data/skills/slash/critical-strike"
import { peerlessStonecleaver } from "@workspace/game/data/skills/slash/peerless-stonecleaver"
import { tempestSlash } from "@workspace/game/data/skills/slash/tempest-slash"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const SLASH_SKILLS = {
  cleave,
  "tempest-slash": tempestSlash,
  "critical-strike": criticalStrike,
  "peerless-stonecleaver": peerlessStonecleaver,
} as const satisfies Record<string, Skill>
