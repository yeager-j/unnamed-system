import type { EnemyFamily } from "@workspace/game-v2/catalog/enemies"
import {
  resolvedGuard,
  type Entity,
  type ResolvedEntity,
} from "@workspace/game-v2/kernel"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"

import { talentLabel } from "@/domain/labels"

import { buildSkillCardView, type SkillCardView } from "./skill-card-view"

/**
 * The read-only statblock model of a catalog enemy — the v2 successor of the v1
 * `statblockFromEnemy` projection. Shaped **by capability**: `attributes` /
 * `affinities` are `null` exactly when the entity resolves no such read-unit, so
 * a renderer shows a section iff its datum resolved (mirroring `combatantDetail`
 * in {@link ./detail-view}). Skills come off the resolved entity as
 * {@link SkillCardView}s (built here, not in the component) so the browse card
 * and the DM drawer render them identically. There is no `abilities` field — v2
 * authors every enemy trait as an inline Skill.
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
  /** The Skill cards, already folded from the resolved Skills — empty when the
   *  entity resolved no attributes to hydrate their formulas. */
  skills: SkillCardView[]
  /** Whether the entity resolves a Skill Pool (an SP resource). Gates the Skill
   *  cost display — an entity with no pool pays no SP, so a cost coin/chip would
   *  mislead. A capability question, not a PC-vs-enemy one (catalog enemies
   *  simply carry no `skillPool`). */
  hasSkillPool: boolean
  /** Talent display names; `null` when Talents are unsupported, an empty list
   *  when the Talent capability is present but currently empty. */
  talentNames: string[] | null
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
  const attributes = resolved.components.attributes ?? null
  return {
    name: entity.components.identity?.name ?? entity.id,
    level: entity.components.level?.value ?? null,
    family,
    maxHP: resolved.components.vitals?.maxHP ?? 0,
    attributes,
    affinities: resolved.components.affinities ?? null,
    skills: attributes
      ? (resolved.components.skills ?? []).map((skill) =>
          buildSkillCardView(skill, attributes)
        )
      : [],
    hasSkillPool: resolved.components.skillPool !== undefined,
    talentNames: resolvedGuard("talents")(resolved)
      ? resolved.components.talents.map((talent) => talentLabel(talent.key))
      : null,
  }
}
