import {
  ARCHETYPE_TIERS,
  hasMasteryBonus,
  type Archetype,
  type ArchetypePrerequisite,
  type ArchetypeTier,
} from "@workspace/game-v2/archetypes/archetype"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { LINEAGES, type Lineage } from "@workspace/game-v2/kernel/vocab"

/**
 * The Lineage Atlas view-model (ported from v1 `engine/archetypes/atlas.ts`) — the
 * *growth* view over the **whole** Archetype catalog, in contrast to
 * {@link import("./display").getArchetypeDisplay} which shapes only the Archetypes a
 * character has unlocked. v2 reads the owned roster off the **`ResolvedEntity`** and
 * keys ownership by Archetype **key** (`ownedKey`), replacing v1's surrogate
 * `characterArchetype` row id.
 *
 * Affordability (does the player have a Saved Rank to spend?) is deliberately *not*
 * folded into node state — a separate axis the UI layers on.
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
  /** The owned Archetype **key** when owned (the rank-up write target); `null` otherwise. */
  ownedKey: string | null
  /** Keys of the Archetypes this one advances from — its prerequisites' `archetype`
   *  keys. Drives the tree's parent→child connection lines. */
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
  isOrigin?: boolean
  progress: { owned: number; total: number }
  /** All four tiers in order; a tier with no Archetypes has an empty column. */
  columns: AtlasTierColumn[]
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
 * The prerequisites a character has **not** met, in declaration order (A10). A
 * prereq `{ archetype, rank }` is met when the character owns that Archetype at
 * `rank` or higher (`>=`). `ownedRankByKey` maps owned Archetype key → owned Rank.
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
 * The Atlas state for one Archetype: owned (mastered at Rank ≥ 5), else unlockable
 * when every prereq is met, else locked with the unmet prereqs (A11). Owned state
 * **wins over** the prerequisite check — an owned Archetype is never "locked".
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
 * Shapes the full {@link LineageAtlasView}: every Lineage's tier columns, each
 * Archetype's Atlas state, and the parent links. Walks the **whole** catalog via the
 * `allArchetypes` port. `hiddenArchetypeKeys` drops the named Archetypes **before any
 * shaping** (the app's per-viewer gate); the engine is a pure key filter (A4).
 */
export function buildLineageAtlas(deps: Pick<GameData, "allArchetypes">) {
  return (
    resolved: ResolvedEntity,
    options: { hiddenArchetypeKeys?: readonly string[] } = {}
  ): LineageAtlasView => {
    const archetypes = resolved.components.archetypes
    const hidden = new Set(options.hiddenArchetypeKeys ?? [])
    const catalog = deps
      .allArchetypes()
      .filter((archetype) => !hidden.has(archetype.key))
    const byKey = new Map(
      catalog.map((archetype) => [archetype.key, archetype])
    )

    // Owned ranks, keyed by Archetype key — only for keys the catalog resolves (A6
    // drift filter: an owned key not in the catalog contributes nothing).
    const ownedRankByKey = new Map<string, number>()
    for (const entry of archetypes?.roster ?? []) {
      if (byKey.has(entry.key)) ownedRankByKey.set(entry.key, entry.rank)
    }

    const byLineage = new Map<Lineage, Archetype[]>()
    for (const archetype of catalog) {
      const bucket = byLineage.get(archetype.lineage) ?? []
      bucket.push(archetype)
      byLineage.set(archetype.lineage, bucket)
    }

    const origin = archetypes?.origin ?? null
    const originLineage = origin ? (byKey.get(origin)?.lineage ?? null) : null

    const lineages: AtlasLineage[] = LINEAGES.map((lineage) => {
      // Sort by key only; the `columns` projection orders by tier (it filters into
      // ARCHETYPE_TIERS-ordered buckets), so a tier sort here would be redundant.
      const lineageArchetypes = [...(byLineage.get(lineage) ?? [])].sort(
        (a, b) => a.key.localeCompare(b.key)
      )

      const nodes: AtlasNode[] = lineageArchetypes.map((archetype) => {
        const ownedRank = ownedRankByKey.get(archetype.key)
        return {
          archetype,
          state: atlasNodeState(archetype, ownedRank ?? null, ownedRankByKey),
          ownedKey: ownedRank !== undefined ? archetype.key : null,
          parentKeys: archetype.prerequisites.map((p) => p.archetype),
        }
      })

      return {
        lineage,
        isOrigin: originLineage === lineage,
        progress: {
          owned: nodes.filter((node) => node.ownedKey !== null).length,
          total: nodes.length,
        },
        columns: ARCHETYPE_TIERS.map((tier) => ({
          tier,
          nodes: nodes.filter((node) => node.archetype.tier === tier),
        })),
      }
    })

    return {
      lineages,
      savedRanks: archetypes?.savedArchetypeRanks ?? 0,
      unlockedCount: ownedRankByKey.size,
      originLineage,
    }
  }
}

/** Whether a node is one the character has unlocked — owned (Rank ≥ 1) or mastered
 *  (A12). The axis the Atlas's "Unlocked only" filter keys off. */
export function isAtlasNodeUnlocked(node: AtlasNode): boolean {
  return node.state.kind === "owned" || node.state.kind === "mastered"
}

/**
 * Collapses each Lineage to only its unlocked Archetypes, then drops Lineages left
 * with none (A13) — the "Unlocked only" toggle. `progress` is left untouched so a
 * filtered Lineage still reads "owned/total".
 */
export function filterAtlasLineagesToUnlocked(
  lineages: AtlasLineage[]
): AtlasLineage[] {
  return lineages
    .map((lineage) => ({
      ...lineage,
      columns: lineage.columns.map((column) => ({
        ...column,
        nodes: column.nodes.filter(isAtlasNodeUnlocked),
      })),
    }))
    .filter((lineage) =>
      lineage.columns.some((column) => column.nodes.length > 0)
    )
}
