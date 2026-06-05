import type { Skill } from "../schema"
import { cleave } from "./cleave"
import { criticalStrike } from "./critical-strike"
import { peerlessStonecleaver } from "./peerless-stonecleaver"
import { tempestSlash } from "./tempest-slash"

export const SLASH_SKILLS = {
  cleave,
  "tempest-slash": tempestSlash,
  "critical-strike": criticalStrike,
  "peerless-stonecleaver": peerlessStonecleaver,
} as const satisfies Record<string, Skill>
