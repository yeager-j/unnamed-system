/**
 * App-owned re-export of the engine's display-relevant vocabulary — the single
 * seam through which `components/**` sources game vocab types and their constant
 * arrays. Components import from here (never `@workspace/game*` directly), so a
 * future engine rename (UNN-563) or engine swap touches this one file, not every
 * badge. This is the sanctioned "raw vocab enums via a view-model" boundary
 * (UNN-582/583), not vestigial indirection: it re-decides "which engine" once.
 */
export type {
  Affinity,
  AffinityChart,
  AffinityDamageType,
  AttributeKey,
  AttributeScores,
  DamageType,
  Lineage,
  SkillKind,
} from "@workspace/game-v2/kernel/vocab"
export {
  AFFINITY_DAMAGE_TYPES,
  ATTRIBUTE_KEYS,
  LINEAGES,
} from "@workspace/game-v2/kernel/vocab"
export type { NarrativeTextField } from "@workspace/game-v2/narrative"
export type { ResolvedSkillCost } from "@workspace/game-v2/skills/skill.schema"
