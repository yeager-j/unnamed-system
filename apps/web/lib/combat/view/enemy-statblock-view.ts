import type { EnemyFamily } from "@workspace/game-v2/catalog/enemies"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"

/**
 * The read-only statblock model of a catalog enemy — the v2 successor of the v1
 * `statblockFromEnemy` projection. Shaped **by capability**: `attributes` /
 * `affinities` are `null` exactly when the entity resolves no such read-unit, so
 * a renderer shows a section iff its datum resolved (mirroring `combatantDetail`
 * in {@link ./detail-view}). Skills come off the resolved entity as
 * {@link ResolvedSkill}s so the browse card and the DM drawer render them
 * identically. There is no `abilities` field — v2 authors every enemy trait as an
 * inline Skill.
 */
export interface EnemyStatblockView {
  name: string
  /** `null` only for a template that authored no level; a catalog enemy carries
   *  one. */
  level: number | null
  /** The creature's directory family, `null` when the key resolves none. */
  family: EnemyFamily | null
  maxHP: number
  attributes: AttributeScores | null
  affinities: AffinityChart | null
  resolvedSkills: ResolvedSkill[]
  /** Talent slugs; the UI resolves display names. */
  talentKeys: string[]
}

/**
 * Projects an authored enemy {@link Entity} plus its {@link ResolvedEntity} onto
 * the {@link EnemyStatblockView} the browse card renders. `level` and `talents`
 * are read off the authored entity (neither is resolve-emitted); everything else
 * comes off the resolved read-units, `null` when a capability didn't resolve.
 */
export function enemyStatblockView(
  entity: Entity,
  resolved: ResolvedEntity,
  family: EnemyFamily | null
): EnemyStatblockView {
  return {
    name: entity.components.identity?.name ?? entity.id,
    level: entity.components.level?.value ?? null,
    family,
    maxHP: resolved.components.vitals?.maxHP ?? 0,
    attributes: resolved.components.attributes ?? null,
    affinities: resolved.components.affinities ?? null,
    resolvedSkills: resolved.components.skills ?? [],
    talentKeys: (entity.components.talents ?? []).map((talent) => talent.key),
  }
}
