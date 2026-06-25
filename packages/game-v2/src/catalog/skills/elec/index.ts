import { bladeOfElec } from "@workspace/game-v2/catalog/skills/elec/blade-of-elec"
import { stormThrust } from "@workspace/game-v2/catalog/skills/elec/storm-thrust"
import { zio } from "@workspace/game-v2/catalog/skills/elec/zio"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/** Elec Skills, ported from v1 `data/skills/elec/` into the composed shape. */
export const ELEC_SKILLS = {
  "storm-thrust": stormThrust,
  zio,
  "blade-of-elec": bladeOfElec,
} as const satisfies Record<string, Skill>
