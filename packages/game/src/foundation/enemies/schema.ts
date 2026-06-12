import { z } from "zod/v4"

import type { SkillKey } from "@workspace/game/data/skills/registry"
import { TALENT_KEYS } from "@workspace/game/foundation/character/talents/schema"
import {
  AFFINITIES,
  AFFINITY_DAMAGE_TYPES,
} from "@workspace/game/foundation/combat/affinity"
import { skillSchema } from "@workspace/game/foundation/skills/schema"

/** A catalog enemy slug: lowercase alphanumerics and hyphens. Constrains the
 *  `key` of catalog entry definitions. The `{ kind: "catalog-enemy", enemyKey }`
 *  combatant ref keeps `enemyKey` a plain string — a stable pointer (mirroring a
 *  PC ref's `characterId`) that `getEnemy` resolves, not a re-validated slug. */
export const enemyKeySchema = z.string().regex(/^[a-z0-9-]+$/)

/**
 * The creature families the catalog is organized into (the 5e creature types
 * used for playtesting). This is the directory grouping under `5e/<family>/`
 * lifted to a first-class display/filter vocabulary — `getEnemyFamily` resolves
 * a `key` to its family, the browse table groups + filters by it, and
 * {@link ../../ui/labels} renders the labels. The definition itself carries no
 * `family` field: it is a property of *where* an entry lives, kept off every
 * entry so adding a creature never restates its directory.
 */
export const ENEMY_FAMILIES = [
  "humanoid",
  "beast",
  "undead",
  "aberration",
  "monstrosity",
] as const
export type EnemyFamily = (typeof ENEMY_FAMILIES)[number]

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
 * (mirrors {@link ../items/schema}).
 *
 * An enemy's Skills come from two sources, both hydrated into the one
 * `Statblock.skills` list the shared `SkillRow` renders:
 * - `skillKeys` — references into the shared Skill catalog, validated
 *   structurally here and for existence at load time by the registry's
 *   `validate()`.
 * - `inlineSkills` — enemy-specific Skills authored in place (a creature's
 *   weapon attacks and traits) without minting a catalog entry. Each is a full
 *   {@link skillSchema} object. Attack-kind inline Skills must carry a `cost`
 *   because the {@link skillSchema} requires one, but it is **inert for
 *   enemies**: catalog enemies pay no Skill costs (no SP pool, full every
 *   encounter) and every enemy surface renders with the cost row suppressed —
 *   exactly as a referenced catalog Skill's cost is ignored. `passive` traits
 *   carry no cost. Author a nominal `{ kind: "sp", amount: 1 }` on attacks.
 *
 * No `maxSP`: the rulebook gives monsters no SP, and an ephemeral monster that
 * starts every encounter full never hits a `cost ≤ currentSP` gate, so an SP
 * pool would be bookkeeping with no decision value. HP is the one pool an
 * encounter depletes. `abilities` remains as a freeform-Markdown escape hatch
 * for content that fits no Skill kind (unused by the shipped catalog, which
 * authors everything as `inlineSkills`).
 */
export const enemyDefinitionSchema = z.object({
  key: enemyKeySchema,
  level: z.number().int().positive(),
  name: z.string().min(1),
  maxHP: z.number().int().nonnegative(),
  attributes: attributesSchema,
  affinities: affinitiesSchema,
  skillKeys: z.array(z.string().min(1)),
  inlineSkills: z.array(skillSchema).optional(),
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
