import { ailmentBoost } from "@workspace/game-v2/catalog/skills/passive/ailment-boost"
import { autoRakukaja } from "@workspace/game-v2/catalog/skills/passive/auto-rakukaja"
import { autoSukukaja } from "@workspace/game-v2/catalog/skills/passive/auto-sukukaja"
import { autoTarukaja } from "@workspace/game-v2/catalog/skills/passive/auto-tarukaja"
import { avarice } from "@workspace/game-v2/catalog/skills/passive/avarice"
import { bardsInsight } from "@workspace/game-v2/catalog/skills/passive/bards-insight"
import { healersInsight } from "@workspace/game-v2/catalog/skills/passive/healers-insight"
import { magicCircle } from "@workspace/game-v2/catalog/skills/passive/magic-circle"
import { slashBoost } from "@workspace/game-v2/catalog/skills/passive/slash-boost"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Passive Skills, ported from v1 `data/skills/passive/` into the composed shape. */
export const PASSIVE_SKILLS = {
  "slash-boost": slashBoost,
  "auto-rakukaja": autoRakukaja,
  "auto-sukukaja": autoSukukaja,
  "auto-tarukaja": autoTarukaja,
  avarice,
  "magic-circle": magicCircle,
  "healers-insight": healersInsight,
  "ailment-boost": ailmentBoost,
  "bards-insight": bardsInsight,
} as const satisfies Record<string, Skill>
