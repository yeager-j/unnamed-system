import { getMechanic } from "../mechanics"
import { getSkill } from "../skills"
import { getTalent } from "../talents"
import { healer } from "./healer"
import { knight } from "./knight"
import { mage } from "./mage"
import { archetypeSchema, type Archetype } from "./schema"
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

  if (archetype.mechanic && !getMechanic(archetype.mechanic)) {
    throw new Error(
      `Archetype "${archetype.key}" references unknown mechanic "${archetype.mechanic}"`
    )
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
 * Every initiate-tier Archetype, in catalog order. The builder's Movement 1
 * grid iterates over this list; the picker's Path-sensitive sort runs on
 * top of it (see {@link sortArchetypesByPath}).
 *
 * Cast narrows `.key` from the schema's generic `string` to the catalog's
 * `ArchetypeKey` union so callers don't need to widen at the boundary.
 */
export const INITIATE_ARCHETYPES = ARCHETYPES.filter(
  (archetype) => archetype.tier === "initiate"
) as readonly (Archetype & { key: ArchetypeKey })[]

/**
 * Slug keys of every initiate-tier Archetype — i.e. the set of valid
 * `archetypeKey` values for {@link setOriginArchetypeAction}. Kept in
 * lock-step with {@link INITIATE_ARCHETYPES} so the picker UI and the
 * server-side input validation can't drift apart.
 */
export const ORIGIN_ARCHETYPE_KEYS = INITIATE_ARCHETYPES.map(
  (archetype) => archetype.key
) as [string, ...string[]]

/**
 * Looks up a hardcoded Archetype by its slug key. Returns `undefined` when no
 * Archetype matches.
 */
export function getArchetype(key: string): Archetype | undefined {
  return (ARCHETYPES_BY_KEY as Record<string, Archetype>)[key]
}

/**
 * The active Archetype's display name, or `"Adventurer"` when the character
 * has no active Archetype (`null`) or the key resolves to no Archetype. Shared
 * by the public sheet, its header, and the route's `generateMetadata` so the
 * fallback can't drift between surfaces.
 */
export function archetypeDisplayName(key: string | null): string {
  return (key ? getArchetype(key)?.name : undefined) ?? "Adventurer"
}
