import { AILMENT_SKILLS } from "@workspace/game-v2/catalog/skills/ailment"
import { ALMIGHTY_SKILLS } from "@workspace/game-v2/catalog/skills/almighty"
import { DARK_SKILLS } from "@workspace/game-v2/catalog/skills/dark"
import { ELEC_SKILLS } from "@workspace/game-v2/catalog/skills/elec"
import { FIRE_SKILLS } from "@workspace/game-v2/catalog/skills/fire"
import { HEAL_SKILLS } from "@workspace/game-v2/catalog/skills/heal"
import { ICE_SKILLS } from "@workspace/game-v2/catalog/skills/ice"
import { LIGHT_SKILLS } from "@workspace/game-v2/catalog/skills/light"
import { MIND_SKILLS } from "@workspace/game-v2/catalog/skills/mind"
import { PASSIVE_SKILLS } from "@workspace/game-v2/catalog/skills/passive"
import { PIERCE_SKILLS } from "@workspace/game-v2/catalog/skills/pierce"
import { SLASH_SKILLS } from "@workspace/game-v2/catalog/skills/slash"
import { SOUL_SKILLS } from "@workspace/game-v2/catalog/skills/soul"
import { SPECIAL_SKILLS } from "@workspace/game-v2/catalog/skills/special"
import { STRIKE_SKILLS } from "@workspace/game-v2/catalog/skills/strike"
import { SUPPORT_SKILLS } from "@workspace/game-v2/catalog/skills/support"
import { WIND_SKILLS } from "@workspace/game-v2/catalog/skills/wind"
import { skillSchema, type Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The ported v1 Skill catalog (PR-S / UNN-506) in the composed shape — the authored
 * content behind the `getSkill` port. One file per Skill under an element/category
 * folder with a `Record`-keyed barrel, mirroring v1's `data/skills/` layout for a
 * reviewable 1:1 diff. Each Skill is **validated at load** with {@link skillSchema}
 * (so a malformed port fails fast, like v1's `createCatalog`) and indexed by its
 * unique `key`; the load also asserts the barrel key matches the Skill's own `key`.
 */
const SKILLS_BY_KEY_RAW = {
  ...SLASH_SKILLS,
  ...STRIKE_SKILLS,
  ...PIERCE_SKILLS,
  ...FIRE_SKILLS,
  ...ICE_SKILLS,
  ...ELEC_SKILLS,
  ...WIND_SKILLS,
  ...MIND_SKILLS,
  ...LIGHT_SKILLS,
  ...DARK_SKILLS,
  ...SOUL_SKILLS,
  ...HEAL_SKILLS,
  ...SUPPORT_SKILLS,
  ...AILMENT_SKILLS,
  ...PASSIVE_SKILLS,
  ...SPECIAL_SKILLS,
  ...ALMIGHTY_SKILLS,
} satisfies Record<string, Skill>

const SKILLS_BY_KEY = new Map<string, Skill>()
for (const [key, skill] of Object.entries(SKILLS_BY_KEY_RAW)) {
  const parsed = skillSchema.parse(skill)
  if (parsed.key !== key) {
    throw new Error(
      `Catalog key mismatch: barrel "${key}" vs skill.key "${parsed.key}"`
    )
  }
  SKILLS_BY_KEY.set(key, parsed)
}

/** Every catalog Skill, validated and in registration order. */
export const SKILLS: readonly Skill[] = [...SKILLS_BY_KEY.values()]

/** Looks up a catalog Skill by its slug key; `undefined` when none matches. */
export function getSkill(key: string): Skill | undefined {
  return SKILLS_BY_KEY.get(key)
}
