import type { CharacterArchetypeRow } from "@/lib/db/schema/character"

import type { HydratedCharacter } from "../character/hydrated-character"
import { LINEAGES, type Lineage } from "../character/lineage"
import { hasMasteryBonus } from "./rank"
import { ARCHETYPES, getArchetype } from "./registry"
import {
  ARCHETYPE_TIERS,
  type Archetype,
  type ArchetypePrerequisite,
  type ArchetypeTier,
} from "./schema"

/**
 * The Lineage Atlas view-model (UNN-239) — the *growth* view over the **whole**
 * Archetype catalog, in contrast to {@link getArchetypeDisplay} which shapes
 * only the Archetypes a character has already unlocked.
 *
 * Pure domain shaping: it takes a {@link HydratedCharacter} and the catalog and
 * produces every Lineage's tier columns with a per-Archetype {@link AtlasNode}
 * state (unlockable / locked / owned / mastered) plus the parent links the tree
 * draws its connection lines from. Affordability (does the player have a Saved
 * Rank to spend?) is deliberately *not* folded into node state — it's a
 * separate axis the UI layers on, so an unlockable card still reads "Unlockable"
 * while its button disables for lack of Ranks.
 */

/** One Archetype's state on the Atlas. */
export type AtlasNodeState =
  | { kind: "unlockable" }
  | { kind: "locked"; unmetPrerequisites: ArchetypePrerequisite[] }
  | { kind: "owned"; rank: number }
  | { kind: "mastered"; rank: number }

export interface AtlasNode {
  archetype: Archetype
  state: AtlasNodeState
  /**
   * The owning `characterArchetype` row id when the Archetype is owned (the
   * rank-up write target); `null` otherwise.
   */
  characterArchetypeId: string | null
  /**
   * Keys of the Archetypes this one advances from — its prerequisites'
   * `archetype` keys. Drives the tree's parent→child connection lines; the
   * renderer only draws a line when the parent is present in the same Lineage's
   * columns.
   */
  parentKeys: string[]
}

/** All Archetypes of one tier within a Lineage, in catalog order. */
export interface AtlasTierColumn {
  tier: ArchetypeTier
  nodes: AtlasNode[]
}

/** One Lineage's full column set plus its unlocked-progress count. */
export interface AtlasLineage {
  lineage: Lineage
  progress: { owned: number; total: number }
  /** All four tiers in order; a tier with no Archetypes has an empty column. */
  columns: AtlasTierColumn[]
}

/**
 * One filled recommendation slot at the top of the Atlas. Computed by the
 * recommendation-logic ticket (UNN-256) and rendered by the Atlas (UNN-239):
 * enough to act on directly — the Archetype, its current Atlas state (so the
 * slot shows Unlock vs. Rank up), the owned row id when ranking up, and whether
 * it's the player's Origin Lineage (the first slot's "Origin Lineage" badge).
 */
export interface AtlasRecommendation {
  archetype: Archetype
  state: AtlasNodeState
  characterArchetypeId: string | null
  isOriginLineage: boolean
}

export interface LineageAtlasView {
  /** All twelve Lineages, in the rulebook's canonical order. */
  lineages: AtlasLineage[]
  /** Saved Archetype Ranks available to spend. */
  savedRanks: number
  /** Total Archetypes the character has unlocked across all Lineages. */
  unlockedCount: number
  /** The Lineage of the character's Origin Archetype, or `null`. */
  originLineage: Lineage | null
}

/**
 * The prerequisites a character has *not* met, in declaration order. A
 * prerequisite `{ archetype, rank }` is met when the character owns that
 * Archetype at `rank` or higher (`ownedRankByKey` maps Archetype slug → owned
 * Rank). An empty result means every prerequisite is satisfied.
 */
export function unmetPrerequisites(
  archetype: Archetype,
  ownedRankByKey: ReadonlyMap<string, number>
): ArchetypePrerequisite[] {
  return archetype.prerequisites.filter(
    (prerequisite) =>
      (ownedRankByKey.get(prerequisite.archetype) ?? 0) < prerequisite.rank
  )
}

/**
 * The Atlas state for one Archetype: owned (with Mastery when at the Mastery
 * Rank), else unlockable when every prerequisite is met, else locked with the
 * unmet prerequisites. `ownedRank` is the character's Rank in this Archetype
 * (`null`/absent when unowned); `ownedRankByKey` carries every owned Rank so
 * prerequisites referencing *other* Archetypes resolve.
 */
export function atlasNodeState(
  archetype: Archetype,
  ownedRank: number | null,
  ownedRankByKey: ReadonlyMap<string, number>
): AtlasNodeState {
  if (ownedRank !== null) {
    return hasMasteryBonus(ownedRank)
      ? { kind: "mastered", rank: ownedRank }
      : { kind: "owned", rank: ownedRank }
  }
  const unmet = unmetPrerequisites(archetype, ownedRankByKey)
  return unmet.length > 0
    ? { kind: "locked", unmetPrerequisites: unmet }
    : { kind: "unlockable" }
}

/**
 * Shapes the full {@link LineageAtlasView} for a character: every Lineage's
 * tier columns, each Archetype's Atlas state, and the parent links the tree
 * uses for connection lines. Owned state is resolved from the character's
 * `characterArchetype` rows (keyed by Archetype slug — a character owns at most
 * one row per Archetype).
 */
export function buildLineageAtlas(
  character: HydratedCharacter
): LineageAtlasView {
  const ownedRowByKey = new Map<string, CharacterArchetypeRow>()
  for (const row of character.archetypeRows) {
    if (getArchetype(row.archetypeKey)) ownedRowByKey.set(row.archetypeKey, row)
  }
  const ownedRankByKey = new Map<string, number>(
    [...ownedRowByKey].map(([key, row]) => [key, row.rank])
  )

  const tierIndex = new Map<ArchetypeTier, number>(
    ARCHETYPE_TIERS.map((tier, index) => [tier, index])
  )
  const byLineage = new Map<Lineage, Archetype[]>()
  for (const archetype of ARCHETYPES) {
    const bucket = byLineage.get(archetype.lineage) ?? []
    bucket.push(archetype)
    byLineage.set(archetype.lineage, bucket)
  }

  const lineages: AtlasLineage[] = LINEAGES.map((lineage) => {
    const archetypes = (byLineage.get(lineage) ?? [])
      .slice()
      .sort(
        (a, b) =>
          tierIndex.get(a.tier)! - tierIndex.get(b.tier)! ||
          a.key.localeCompare(b.key)
      )

    const nodes: AtlasNode[] = archetypes.map((archetype) => {
      const ownedRow = ownedRowByKey.get(archetype.key)
      return {
        archetype,
        state: atlasNodeState(
          archetype,
          ownedRow?.rank ?? null,
          ownedRankByKey
        ),
        characterArchetypeId: ownedRow?.id ?? null,
        parentKeys: archetype.prerequisites.map(
          (prerequisite) => prerequisite.archetype
        ),
      }
    })

    return {
      lineage,
      progress: {
        owned: nodes.filter((node) => node.characterArchetypeId !== null)
          .length,
        total: nodes.length,
      },
      columns: ARCHETYPE_TIERS.map((tier) => ({
        tier,
        nodes: nodes.filter((node) => node.archetype.tier === tier),
      })),
    }
  })

  const originRow = character.originCharacterArchetypeId
    ? character.archetypeRows.find(
        (row) => row.id === character.originCharacterArchetypeId
      )
    : undefined
  const originLineage =
    (originRow && getArchetype(originRow.archetypeKey)?.lineage) ?? null

  return {
    lineages,
    savedRanks: character.savedArchetypeRanks,
    unlockedCount: ownedRowByKey.size,
    originLineage,
  }
}
