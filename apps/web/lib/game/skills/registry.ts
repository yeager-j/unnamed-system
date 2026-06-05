import { createCatalog } from "../catalog"
import { AILMENT_SKILLS } from "./ailment"
import { DARK_SKILLS } from "./dark"
import { ELEC_SKILLS } from "./elec"
import { FIRE_SKILLS } from "./fire"
import { HEAL_SKILLS } from "./heal"
import { ICE_SKILLS } from "./ice"
import { LIGHT_SKILLS } from "./light"
import { PASSIVE_SKILLS } from "./passive"
import { PIERCE_SKILLS } from "./pierce"
import { PSY_SKILLS } from "./psy"
import { skillSchema, type Skill } from "./schema"
import { SLASH_SKILLS } from "./slash"
import { SPECIAL_SKILLS } from "./special"
import { STRIKE_SKILLS } from "./strike"
import { SUPPORT_SKILLS } from "./support"
import { WIND_SKILLS } from "./wind"

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
