import type { CharacterArchetypeRow } from "@/lib/db/schema/character"

import type { HydratedCharacter } from "../character/hydrated-character"
import { MAX_LEVEL } from "../character/leveling"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type Lineage,
  type SuggestedPath,
} from "../character/lineage"
import type { PathChoice } from "../character/state"
import { hasMasteryBonus } from "./rank"
import { ARCHETYPES } from "./registry"
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
  isOrigin?: boolean
  progress: { owned: number; total: number }
  /** All four tiers in order; a tier with no Archetypes has an empty column. */
  columns: AtlasTierColumn[]
}

/**
 * Why an Archetype was recommended — the rationale the Atlas surfaces on each
 * slot (label + icon resolved in the UI layer via `RECOMMENDATION_REASON_DISPLAY`).
 * Mirrors the selection logic exactly: `origin-lineage` is the Origin priority
 * pick, `unlocked-archetype` is a Lineage the character has already invested a
 * Rank in (continue the build), `fits-path` is a fresh Lineage that suits the
 * character's Path (discovery).
 */
export type RecommendationReason =
  | "origin-lineage"
  | "unlocked-archetype"
  | "fits-path"

/**
 * One filled recommendation slot at the top of the Atlas. Computed by the
 * recommendation-logic ticket (UNN-256) and rendered by the Atlas (UNN-239):
 * enough to act on directly — the Archetype, its current Atlas state (so the
 * slot shows Unlock vs. Rank up), the owned row id when ranking up, and the
 * {@link RecommendationReason} the slot displays.
 */
export interface AtlasRecommendation {
  archetype: Archetype
  state: AtlasNodeState
  characterArchetypeId: string | null
  reason: RecommendationReason
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
 *
 * `catalog` defaults to the full {@link ARCHETYPES} registry; it is a parameter
 * so tests can inject a fixture catalog with the multi-tier lineages and
 * prerequisites the shipped set doesn't yet carry (the demo set does), to
 * exercise the tier sort and prerequisite resolution.
 */
export function buildLineageAtlas(
  character: HydratedCharacter,
  catalog: readonly Archetype[] = ARCHETYPES
): LineageAtlasView {
  const byKey = new Map(catalog.map((archetype) => [archetype.key, archetype]))
  const ownedRowByKey = new Map<string, CharacterArchetypeRow>()
  for (const row of character.archetypeRows) {
    if (byKey.has(row.archetypeKey)) ownedRowByKey.set(row.archetypeKey, row)
  }
  const ownedRankByKey = new Map<string, number>(
    [...ownedRowByKey].map(([key, row]) => [key, row.rank])
  )

  const byLineage = new Map<Lineage, Archetype[]>()
  for (const archetype of catalog) {
    const bucket = byLineage.get(archetype.lineage) ?? []
    bucket.push(archetype)
    byLineage.set(archetype.lineage, bucket)
  }

  const originRow = character.originCharacterArchetypeId
    ? character.archetypeRows.find(
        (row) => row.id === character.originCharacterArchetypeId
      )
    : undefined
  const originLineage =
    (originRow && byKey.get(originRow.archetypeKey)?.lineage) ?? null

  const lineages: AtlasLineage[] = LINEAGES.map((lineage) => {
    // Sort by key only; the `columns` projection below already orders by tier
    // (it filters into ARCHETYPE_TIERS-ordered buckets), so a tier sort here
    // would be redundant.
    const archetypes = (byLineage.get(lineage) ?? [])
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))

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
        parentKeys: archetype.prerequisites.map((p) => p.archetype),
      }
    })

    return {
      lineage,
      isOrigin: originLineage === lineage,
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

  return {
    lineages,
    savedRanks: character.savedArchetypeRanks,
    unlockedCount: ownedRowByKey.size,
    originLineage,
  }
}

/** Whether a node is one the character has unlocked — owned (Rank ≥ 1) or
 *  mastered. The axis the Atlas's "Unlocked only" filter keys off of. */
export function isAtlasNodeUnlocked(node: AtlasNode): boolean {
  return node.state.kind === "owned" || node.state.kind === "mastered"
}

/**
 * Collapses each Lineage's tree to only the Archetypes the character has
 * unlocked, then drops Lineages left with none — the view behind the Atlas's
 * "Unlocked only" toggle, which reproduces the retired Archetypes-tab roster
 * inside the tree. `progress` is left untouched so a filtered Lineage still
 * reads "owned/total".
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

/**
 * The {@link SuggestedPath} a character's HP/SP {@link PathChoice} fits — the
 * bucket Path-fit recommendations match against. Mirrors the leading bucket of
 * the Movement-1 grid sort (`sortArchetypesByPath`): a Health-Focused character
 * fits `health` Lineages, Skill-Focused fits `skill`, Balanced fits `balanced`.
 */
const SUGGESTED_PATH_BY_CHOICE: Record<PathChoice, SuggestedPath> = {
  "health-focused": "health",
  balanced: "balanced",
  "skill-focused": "skill",
}

const TIER_RANK = new Map<ArchetypeTier, number>(
  // Stryker disable next-line ArrowFunction: a `() => undefined` mutant breaks this module-level Map at import; Stryker (coverageAnalysis "off") can't observe an import-time throw, so it can't kill it. The sibling ArrayDeclaration mutant on this line IS killed by the recommendation tier-ordering tests, proving the value is load-bearing.
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
)

/** An eligible Atlas node with the unlocked-count of its Lineage carried along,
 *  so the recommendation sort can nudge toward Lineages already in progress
 *  without re-walking the view. */
interface RecommendationCandidate {
  node: AtlasNode
  lineage: Lineage
  ownedInLineage: number
}

/** A node is actionable (so, recommendable) only when it can be unlocked now or
 *  ranked up: `locked` (unmet prerequisites) and `mastered` (Rank 5, no further
 *  progression) are excluded. Owned-below-Mastery means a rank-up is available. */
function isRecommendable(node: AtlasNode): boolean {
  return node.state.kind === "unlockable" || node.state.kind === "owned"
}

/** Rank-up (an already-owned Archetype) sorts before a fresh unlock, so a
 *  recommendation deepens existing investment before opening something new. */
function actionRank(node: AtlasNode): number {
  return node.state.kind === "owned" ? 0 : 1
}

function tierRank(node: AtlasNode): number {
  return TIER_RANK.get(node.archetype.tier)!
}

/**
 * The three "Recommended for your [Path] Path" slots (UNN-256), computed over a
 * {@link buildLineageAtlas} view. Slot 1 prioritizes the most natural next step
 * in the character's Origin Lineage. Slots 2–3 (and Slot 1 when the Origin
 * Lineage offers nothing actionable) draw from two pools: Archetypes in any
 * Lineage the character has already invested a Rank in (continue what you've
 * started — *regardless of Path*) and Archetypes whose Lineage's
 * `LINEAGE_SUGGESTED_PATH` matches the character's Path (discover a new Lineage
 * that fits). In-progress Lineages rank ahead of untouched on-Path ones — depth
 * before breadth. An untouched *off-Path* Lineage is never surfaced: an unrelated
 * fresh start isn't a recommendation. Only actionable Archetypes are surfaced
 * (see {@link isRecommendable}); the three slots never repeat an Archetype, and
 * fewer than three eligible picks yields a shorter list rather than padding.
 * Saved Ranks don't gate the list — a character with none still plans ahead —
 * except at the level ceiling, where no ranks can ever be earned and the list is
 * empty.
 */
export function getAtlasRecommendations(
  view: LineageAtlasView,
  pathChoice: PathChoice,
  level: number
): AtlasRecommendation[] {
  if (view.savedRanks === 0 && level >= MAX_LEVEL) return []

  const candidates: RecommendationCandidate[] = view.lineages.flatMap(
    (lineage) =>
      lineage.columns
        .flatMap((column) => column.nodes)
        .filter(isRecommendable)
        .map((node) => ({
          node,
          lineage: lineage.lineage,
          ownedInLineage: lineage.progress.owned,
        }))
  )

  const toRecommendation = (
    candidate: RecommendationCandidate
  ): AtlasRecommendation => ({
    archetype: candidate.node.archetype,
    state: candidate.node.state,
    characterArchetypeId: candidate.node.characterArchetypeId,
    reason:
      candidate.lineage === view.originLineage
        ? "origin-lineage"
        : candidate.ownedInLineage > 0
          ? "unlocked-archetype"
          : "fits-path",
  })

  const recommendations: AtlasRecommendation[] = []
  const used = new Set<string>()

  const originPick = candidates
    .filter((candidate) => candidate.lineage === view.originLineage)
    .sort(
      (a, b) =>
        tierRank(a.node) - tierRank(b.node) ||
        actionRank(a.node) - actionRank(b.node) ||
        a.node.archetype.key.localeCompare(b.node.archetype.key)
    )[0]

  if (originPick) {
    recommendations.push(toRecommendation(originPick))
    used.add(originPick.node.archetype.key)
  }

  const targetPath = SUGGESTED_PATH_BY_CHOICE[pathChoice]
  const fillCandidates = candidates
    .filter(
      (candidate) =>
        !used.has(candidate.node.archetype.key) &&
        (candidate.ownedInLineage > 0 ||
          LINEAGE_SUGGESTED_PATH[candidate.lineage] === targetPath)
    )
    .sort(
      (a, b) =>
        Number(b.ownedInLineage > 0) - Number(a.ownedInLineage > 0) ||
        actionRank(a.node) - actionRank(b.node) ||
        tierRank(a.node) - tierRank(b.node) ||
        a.node.archetype.key.localeCompare(b.node.archetype.key)
    )

  for (const candidate of fillCandidates) {
    if (recommendations.length >= 3) break
    recommendations.push(toRecommendation(candidate))
  }

  return recommendations
}
