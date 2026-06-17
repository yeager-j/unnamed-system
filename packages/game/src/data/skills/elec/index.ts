import { bladeOfElec } from "@workspace/game/data/skills/elec/blade-of-elec"
import { stormThrust } from "@workspace/game/data/skills/elec/storm-thrust"
import { zio } from "@workspace/game/data/skills/elec/zio"
import type { Skill } from "@workspace/game/foundation/skills/schema"

export const ELEC_SKILLS = {
  "storm-thrust": stormThrust,
  zio,
  "blade-of-elec": bladeOfElec,
} as const satisfies Record<string, Skill>
