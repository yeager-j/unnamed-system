import { bard } from "@workspace/game/data/archetypes/bard/bard"
import { berserker } from "@workspace/game/data/archetypes/berserker/berserker"
import { INCLUDE_DEMO_ARCHETYPES } from "@workspace/game/data/archetypes/demo/include"
import { DEMO_ARCHETYPES } from "@workspace/game/data/archetypes/demo/index"
import { healer } from "@workspace/game/data/archetypes/healer/healer"
import { knight } from "@workspace/game/data/archetypes/knight/knight"
import { mage } from "@workspace/game/data/archetypes/mage/mage"
import { elementalThief } from "@workspace/game/data/archetypes/thief/elemental-thief"
import { thief } from "@workspace/game/data/archetypes/thief/thief"
import { warlock } from "@workspace/game/data/archetypes/warlock/warlock"
import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { getTalent } from "@workspace/game/data/character/talents/registry"
import { getSkill } from "@workspace/game/data/skills/registry"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import {
  archetypeSchema,
  type Archetype,
} from "@workspace/game/foundation/archetypes/schema"

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
  warlock: validate(warlock),
  thief: validate(thief),
  "elemental-thief": validate(elementalThief),
  bard: validate(bard),
  berserker: validate(berserker),
} as const satisfies Record<string, Archetype>

/**
 * Slug keys of the **shipped** catalog only. Demo Archetypes
 * ({@link DEMO_ARCHETYPES}) are deliberately excluded — they exist only at
 * runtime behind {@link INCLUDE_DEMO_ARCHETYPES}, so typed surfaces (Origin
 * selection, switcher options) never reference a key that may vanish in
 * Production.
 */
export type ArchetypeKey = keyof typeof ARCHETYPES_BY_KEY

/**
 * The runtime catalog: the shipped Archetypes plus any demo trees, but only
 * when {@link INCLUDE_DEMO_ARCHETYPES} is on (local dev + Vercel Preview).
 * Demo entries are validated the same way the shipped ones are.
 */
export const ARCHETYPES: readonly Archetype[] = [
  ...Object.values(ARCHETYPES_BY_KEY),
  ...(INCLUDE_DEMO_ARCHETYPES ? DEMO_ARCHETYPES.map(validate) : []),
]

const ARCHETYPE_BY_KEY: ReadonlyMap<string, Archetype> = new Map(
  ARCHETYPES.map((archetype) => [archetype.key, archetype])
)

/**
 * Every **shipped** initiate-tier Archetype, in catalog order. The builder's
 * Movement 1 grid iterates over this list; the picker's Path-sensitive sort
 * runs on top of it (see {@link sortArchetypesByPath}). Sourced from the
 * shipped const, not the runtime {@link ARCHETYPES}, so a demo initiate can't
 * leak into Origin selection.
 *
 * Cast narrows `.key` from the schema's generic `string` to the catalog's
 * `ArchetypeKey` union so callers don't need to widen at the boundary.
 */
export const INITIATE_ARCHETYPES = Object.values(ARCHETYPES_BY_KEY).filter(
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
  return ARCHETYPE_BY_KEY.get(key)
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
