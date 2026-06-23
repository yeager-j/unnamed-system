/**
 * Resolved progression read-units `resolve` emits (D30). Effective `attributes`
 * and `affinities` reuse the vocab shapes ({@link AttributeScores}/
 * {@link AffinityChart}); the consumable dice **maxima** are derived from level.
 */

/** Resolved Hit/Skill Dice maxima (derived from level; the consumable pools are PR3). */
export interface ResolvedResources {
  maxHitDice: number
  maxSkillDice: number
}
