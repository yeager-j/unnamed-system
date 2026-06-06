import { getTalent } from "@workspace/game/character"
import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@workspace/game/combat"
import { getEnemyFamily } from "@workspace/game/data/enemies/registry"
import type {
  EnemyDefinition,
  EnemyFamily,
} from "@workspace/game/foundation/enemies/schema"
import { getSkill } from "@workspace/game/skills"

/**
 * NOTE (end-of-project tech-debt sweep): this statblock view-model — and the
 * `EnemyStatblockCard` that renders it (UNN-346) — deliberately duplicate the
 * enemy rendering in the combatant detail drawer (UNN-345) and the player-view
 * statblock (UNN-324). The browse surface is standalone for now; the three are
 * reconciled in the dedup sweep, not here. Leave this pointer so the sweep finds
 * all three.
 */

/** One damage type's charted affinity for the detail grid — every one of the
 *  eleven types, in canonical order, with an unset type resolved to Neutral. */
export interface EnemyDetailAffinity {
  damageType: AffinityDamageType
  affinity: Affinity
}

/** A named reference (talent or skill) for the detail badges. */
export interface NamedRef {
  key: string
  name: string
}

/**
 * The fully resolved statblock the detail pane renders (UNN-346): the catalog
 * definition with its `skillKeys`/`talents` resolved to display names and its
 * sparse affinity chart expanded to the full ordered grid. No SP — catalog
 * monsters have none (the definition declares none). Pure shaping over an
 * {@link EnemyDefinition}.
 */
export interface EnemyDetailView {
  key: string
  name: string
  family: EnemyFamily | null
  level: number
  maxHP: number
  attributes: EnemyDefinition["attributes"]
  affinities: EnemyDetailAffinity[]
  talents: NamedRef[]
  skills: NamedRef[]
  abilities?: string
}

/** Expands a sparse affinity chart to the full eleven-type grid in
 *  {@link AFFINITY_DAMAGE_TYPES} order, an absent type resolving to Neutral. */
function resolveAffinityGrid(
  affinities: EnemyDefinition["affinities"]
): EnemyDetailAffinity[] {
  return AFFINITY_DAMAGE_TYPES.map((damageType) => ({
    damageType,
    affinity: affinities[damageType] ?? "neutral",
  }))
}

/**
 * Shapes one catalog {@link EnemyDefinition} into the {@link EnemyDetailView} the
 * statblock pane renders: resolves talent + skill names (falling back to the raw
 * key if a lookup ever misses) and the full affinity grid.
 */
export function buildEnemyDetailView(enemy: EnemyDefinition): EnemyDetailView {
  return {
    key: enemy.key,
    name: enemy.name,
    family: getEnemyFamily(enemy.key) ?? null,
    level: enemy.level,
    maxHP: enemy.maxHP,
    attributes: enemy.attributes,
    affinities: resolveAffinityGrid(enemy.affinities),
    talents: enemy.talents.map((key) => ({
      key,
      name: getTalent(key)?.name ?? key,
    })),
    skills: enemy.skillKeys.map((key) => ({
      key,
      name: getSkill(key)?.name ?? key,
    })),
    abilities: enemy.abilities,
  }
}
