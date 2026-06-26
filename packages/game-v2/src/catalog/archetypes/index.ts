import type { Archetype } from "@workspace/game-v2/archetypes"
import { bard } from "@workspace/game-v2/catalog/archetypes/bard"
import { berserker } from "@workspace/game-v2/catalog/archetypes/berserker"
import { elementalThief } from "@workspace/game-v2/catalog/archetypes/elemental-thief"
import { healer } from "@workspace/game-v2/catalog/archetypes/healer"
import { knight } from "@workspace/game-v2/catalog/archetypes/knight"
import { mage } from "@workspace/game-v2/catalog/archetypes/mage"
import { thief } from "@workspace/game-v2/catalog/archetypes/thief"
import { warlock } from "@workspace/game-v2/catalog/archetypes/warlock"
import { warrior } from "@workspace/game-v2/catalog/archetypes/warrior"
import { getSkill } from "@workspace/game-v2/catalog/skills"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"

/**
 * The ported v1 Archetype catalog (UNN-504) — the authored content behind the
 * `getArchetype`/`allArchetypes` port, one file per Archetype (`satisfies Archetype`
 * gives compile-time shape checking). The eight shipping Initiate Archetypes plus
 * the Adept `elemental-thief` (unconditional in the catalog; the app hides it
 * per-viewer via the Atlas's `hiddenArchetypeKeys`).
 *
 * {@link validate} asserts each cross-reference resolves at load (mirroring v1's
 * registry `validate`) so a typo fails the import, not a downstream lookup. Talents
 * stay unvalidated — v2 ships no Talent catalog yet (they are passthrough strings).
 */
function validate(archetype: Archetype): Archetype {
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
  if (archetype.mechanic && !getMechanic(archetype.mechanic)) {
    throw new Error(
      `Archetype "${archetype.key}" references unknown mechanic "${archetype.mechanic}"`
    )
  }
  return archetype
}

const ARCHETYPES_BY_KEY = new Map<string, Archetype>(
  [
    warrior,
    mage,
    warlock,
    knight,
    healer,
    thief,
    bard,
    berserker,
    elementalThief,
  ].map((archetype) => [archetype.key, validate(archetype)])
)

/** Every catalog Archetype, in registration order (the Atlas's `allArchetypes`). */
export const ARCHETYPES: readonly Archetype[] = [...ARCHETYPES_BY_KEY.values()]

/** Looks up a catalog Archetype by its slug key; `undefined` when none matches. */
export function getArchetype(key: string): Archetype | undefined {
  return ARCHETYPES_BY_KEY.get(key)
}

/** Every catalog Archetype (the `allArchetypes` port — the Atlas walks all of them). */
export function allArchetypes(): Archetype[] {
  return [...ARCHETYPES]
}
