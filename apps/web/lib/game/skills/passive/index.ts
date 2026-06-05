import type { Skill } from "../schema"
import { ailmentBoost } from "./ailment-boost"
import { autoRakukaja } from "./auto-rakukaja"
import { healersInsight } from "./healers-insight"
import { magicCircle } from "./magic-circle"
import { slashBoost } from "./slash-boost"

export const PASSIVE_SKILLS = {
  "slash-boost": slashBoost,
  "auto-rakukaja": autoRakukaja,
  "magic-circle": magicCircle,
  "healers-insight": healersInsight,
  "ailment-boost": ailmentBoost,
} as const satisfies Record<string, Skill>
