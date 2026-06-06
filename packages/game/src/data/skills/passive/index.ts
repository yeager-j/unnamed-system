import { ailmentBoost } from "@workspace/game/data/skills/passive/ailment-boost"
import { autoRakukaja } from "@workspace/game/data/skills/passive/auto-rakukaja"
import { healersInsight } from "@workspace/game/data/skills/passive/healers-insight"
import { magicCircle } from "@workspace/game/data/skills/passive/magic-circle"
import { slashBoost } from "@workspace/game/data/skills/passive/slash-boost"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const PASSIVE_SKILLS = {
  "slash-boost": slashBoost,
  "auto-rakukaja": autoRakukaja,
  "magic-circle": magicCircle,
  "healers-insight": healersInsight,
  "ailment-boost": ailmentBoost,
} as const satisfies Record<string, Skill>
