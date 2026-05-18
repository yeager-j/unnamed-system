import { getSkill } from "../skills"
import { getTalent } from "../talents"
import { archetypeSchema, type Archetype } from "./schema"
import { healer } from "./healer"
import { knight } from "./knight"
import { mage } from "./mage"
import { warrior } from "./warrior"

/**
 * Structurally validates an Archetype, then asserts every cross-reference
 * resolves to a real catalog entry. The schema only checks shape; this is
 * where archetype → Skill / Talent referential integrity is enforced at load
 * time so a typo fails the import, not a downstream lookup.
 */
function validate(archetype: Archetype): Archetype {
  archetypeSchema.parse(archetype)

  for (const { skill } of archetype.skills) {
    if (!getSkill(skill)) {
      throw new Error(
        `Archetype "${archetype.key}" references unknown skill "${skill}"`
      )
    }
  }

  if (archetype.synthesisSkill && !getSkill(archetype.synthesisSkill.skill)) {
    throw new Error(
      `Archetype "${archetype.key}" references unknown synthesis skill "${archetype.synthesisSkill.skill}"`
    )
  }

  for (const talent of archetype.talents) {
    if (!getTalent(talent)) {
      throw new Error(
        `Archetype "${archetype.key}" references unknown talent "${talent}"`
      )
    }
  }

  return archetype
}

const ARCHETYPES_BY_KEY = {
  warrior: validate(warrior),
  knight: validate(knight),
  mage: validate(mage),
  healer: validate(healer),
} as const satisfies Record<string, Archetype>

export type ArchetypeKey = keyof typeof ARCHETYPES_BY_KEY

export const ARCHETYPES: readonly Archetype[] = Object.values(ARCHETYPES_BY_KEY)

/**
 * Looks up a hardcoded Archetype by its slug key. Returns `undefined` when no
 * Archetype matches.
 */
export function getArchetype(key: string): Archetype | undefined {
  return (ARCHETYPES_BY_KEY as Record<string, Archetype>)[key]
}

/** Returns every hardcoded Archetype. */
export function getAllArchetypes(): readonly Archetype[] {
  return ARCHETYPES
}
