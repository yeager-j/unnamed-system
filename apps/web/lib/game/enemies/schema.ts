import { z } from "zod/v4"

import { TALENT_KEYS } from "../character/talents/registry"
import { AFFINITIES, AFFINITY_DAMAGE_TYPES } from "../combat/affinity"
import type { SkillKey } from "../skills/registry"

/** A catalog enemy slug: lowercase alphanumerics and hyphens. Constrains the
 *  `key` of catalog entry definitions. The `{ kind: "catalog-enemy", enemyKey }`
 *  combatant ref keeps `enemyKey` a plain string — a stable pointer (mirroring a
 *  PC ref's `characterId`) that `getEnemy` resolves, not a re-validated slug. */
export const enemyKeySchema = z.string().regex(/^[a-z0-9-]+$/)

/** An enemy's four core Attributes. Unbounded — a monster may have a negative
 *  Attribute (e.g. a Goblin's Magic of −1). */
const attributesSchema = z.object({
  strength: z.number().int(),
  magic: z.number().int(),
  agility: z.number().int(),
  luck: z.number().int(),
})

/**
 * An enemy's Affinity chart, structured so the player-view snapshot can redact
 * it while still showing HP. A sparse partial record: an absent damage type is
 * Neutral. Same shape as the archetype Affinity chart and the `custom` arm.
 */
const affinitiesSchema = z.partialRecord(
  z.enum(AFFINITY_DAMAGE_TYPES),
  z.enum(AFFINITIES)
)

/**
 * One hardcoded catalog enemy. The `catalog` arm of the combatant-ref union
 * points at one of these by `key`; the definition itself is immutable game data
 * (mirrors {@link ../items/schema}). `skillKeys` are validated structurally here
 * and for existence at load time by the registry's `validate()`.
 *
 * No `maxSP`: the rulebook gives monsters no SP, and an ephemeral monster that
 * starts every encounter full never hits a `cost ≤ currentSP` gate, so an SP
 * pool would be bookkeeping with no decision value. HP is the one pool an
 * encounter depletes. `abilities` carries weapon attacks and DM-adjudicated
 * traits as freeform Markdown.
 */
export const enemyDefinitionSchema = z.object({
  key: enemyKeySchema,
  level: z.number().int().positive(),
  name: z.string().min(1),
  maxHP: z.number().int().nonnegative(),
  attributes: attributesSchema,
  affinities: affinitiesSchema,
  skillKeys: z.array(z.string().min(1)),
  talents: z.array(z.enum(TALENT_KEYS)),
  abilities: z.string().min(1).optional(),
})

/**
 * A catalog enemy with its `skillKeys` narrowed to real {@link SkillKey}s. The
 * Zod schema stays structural (a plain `string[]`); the narrowing is enforced
 * at compile time on the hardcoded catalog (`satisfies EnemyDefinition`) and at
 * load time by the registry validator — exactly the items pattern.
 */
export type EnemyDefinition = Omit<
  z.infer<typeof enemyDefinitionSchema>,
  "skillKeys"
> & {
  skillKeys: SkillKey[]
}
