import { archetypeSchema, type Archetype } from "../schema"
import { healer } from "./healer"
import { knight } from "./knight"
import { mage } from "./mage"
import { warrior } from "./warrior"

function validate(archetype: Archetype): Archetype {
  archetypeSchema.parse(archetype)
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
