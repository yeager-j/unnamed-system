import { createCatalog } from "@workspace/game/data/catalog/create-catalog"
import { AILMENT_SKILLS } from "@workspace/game/data/skills/ailment/index"
import { DARK_SKILLS } from "@workspace/game/data/skills/dark/index"
import { ELEC_SKILLS } from "@workspace/game/data/skills/elec/index"
import { FIRE_SKILLS } from "@workspace/game/data/skills/fire/index"
import { HEAL_SKILLS } from "@workspace/game/data/skills/heal/index"
import { ICE_SKILLS } from "@workspace/game/data/skills/ice/index"
import { LIGHT_SKILLS } from "@workspace/game/data/skills/light/index"
import { PASSIVE_SKILLS } from "@workspace/game/data/skills/passive/index"
import { PIERCE_SKILLS } from "@workspace/game/data/skills/pierce/index"
import { PSY_SKILLS } from "@workspace/game/data/skills/psy/index"
import { SLASH_SKILLS } from "@workspace/game/data/skills/slash/index"
import { SPECIAL_SKILLS } from "@workspace/game/data/skills/special/index"
import { STRIKE_SKILLS } from "@workspace/game/data/skills/strike/index"
import { SUPPORT_SKILLS } from "@workspace/game/data/skills/support/index"
import { WIND_SKILLS } from "@workspace/game/data/skills/wind/index"
import {
  skillSchema,
  type Skill,
} from "@workspace/game/foundation/skills/schema"

const SKILLS_BY_KEY = {
  ...SLASH_SKILLS,
  ...STRIKE_SKILLS,
  ...PIERCE_SKILLS,
  ...FIRE_SKILLS,
  ...ICE_SKILLS,
  ...ELEC_SKILLS,
  ...WIND_SKILLS,
  ...PSY_SKILLS,
  ...LIGHT_SKILLS,
  ...DARK_SKILLS,
  ...HEAL_SKILLS,
  ...SUPPORT_SKILLS,
  ...AILMENT_SKILLS,
  ...PASSIVE_SKILLS,
  ...SPECIAL_SKILLS,
} as const satisfies Record<string, Skill>

export type SkillKey = keyof typeof SKILLS_BY_KEY

const catalog = createCatalog<Skill>(SKILLS_BY_KEY, (skill) => {
  skillSchema.parse(skill)
})

export const SKILLS: readonly Skill[] = catalog.all

/**
 * Looks up a hardcoded Skill by its slug key. Returns `undefined` when no
 * Skill matches.
 */
export function getSkill(key: string): Skill | undefined {
  return catalog.get(key)
}
