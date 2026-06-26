import {
  ARCHETYPE_TIERS,
  hasMasteryBonus,
  type Archetype,
  type ArchetypePrerequisite,
  type ArchetypeTier,
} from "@workspace/game-v2/archetypes/archetype"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type DamageType,
  type Lineage,
  type PathChoice,
  type SuggestedPath,
} from "@workspace/game-v2/kernel/vocab"
import { MAX_LEVEL } from "@workspace/game-v2/progression/leveling"

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

// — Atlas recommendations (B1–B11) —

/**
 * Why an Archetype was recommended — the rationale surfaced on each slot.
 * `origin-lineage` is the Origin priority pick; `unlocked-archetype` a Lineage the
 * character has invested a Rank in (continue the build); `fits-path` a fresh Lineage
 * suiting the Path (discovery); `new-damage-type` an off-Path Lineage teaching a
 * missing damage type (broaden coverage) — the lowest-priority reason.
 */
export type RecommendationReason =
  | "origin-lineage"
  | "unlocked-archetype"
  | "fits-path"
  | "new-damage-type"

/** One filled recommendation slot at the top of the Atlas — enough to act on
 *  directly (the Archetype, its Atlas state, the owned key when ranking up, the reason). */
export interface AtlasRecommendation {
  archetype: Archetype
  state: AtlasNodeState
  ownedKey: string | null
  reason: RecommendationReason
}

const SUGGESTED_PATH_BY_CHOICE: Record<PathChoice, SuggestedPath> = {
  "health-focused": "health",
  balanced: "balanced",
  "skill-focused": "skill",
}

const TIER_RANK = new Map<ArchetypeTier, number>(
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
)

/** An eligible node with its Lineage's unlocked count + new-coverage flag carried
 *  along, so the recommendation sort doesn't re-walk the view. */
interface RecommendationCandidate {
  node: AtlasNode
  lineage: Lineage
  ownedInLineage: number
  introducesNewDamageType: boolean
}

/**
 * The concrete attack damage types an Archetype's Skills deal (B9). Reads the v2
 * **typed-damage facet** (`skill.damage.damageType`) — the structural successor to
 * v1's `kind === "attack"` check; a Skill with no `damage` facet (heal/support/
 * ailment/passive) carries no type. The `"special"` multi-element bucket is skipped
 * (not a single resistible type). An unresolved key contributes nothing.
 */
function archetypeDamageTypes(
  archetype: Archetype,
  getSkill: GameData["getSkill"]
): DamageType[] {
  return archetype.skills.flatMap((reference) => {
    const skill = getSkill(reference.skill)
    return skill?.damage && skill.damage.damageType !== "special"
      ? [skill.damage.damageType]
      : []
  })
}

/** Every damage type the character already accesses — the union of attack damage
 *  types across every unlocked (owned/mastered) node on the view (B10). */
function accessibleDamageTypes(
  view: LineageAtlasView,
  getSkill: GameData["getSkill"]
): Set<DamageType> {
  const types = new Set<DamageType>()
  for (const lineage of view.lineages) {
    for (const column of lineage.columns) {
      for (const node of column.nodes) {
        if (!isAtlasNodeUnlocked(node)) continue
        for (const type of archetypeDamageTypes(node.archetype, getSkill)) {
          types.add(type)
        }
      }
    }
  }
  return types
}

/** A node is actionable (recommendable) only when it can be unlocked now or ranked
 *  up: `locked` and `mastered` are excluded (B3). */
function isRecommendable(node: AtlasNode): boolean {
  return node.state.kind === "unlockable" || node.state.kind === "owned"
}

/** Rank-up (owned) sorts before a fresh unlock, deepening investment first. */
function actionRank(node: AtlasNode): number {
  return node.state.kind === "owned" ? 0 : 1
}

function tierRank(node: AtlasNode): number {
  return TIER_RANK.get(node.archetype.tier)!
}

/**
 * Fill-pool ordering of a non-Origin candidate (lower wins, B6): in-progress Lineage
 * (`ownedInLineage > 0`, regardless of Path) → untouched on-Path Lineage → off-Path
 * Lineage teaching a missing damage type.
 */
function fillPriority(
  candidate: RecommendationCandidate,
  targetPath: SuggestedPath
): number {
  if (candidate.ownedInLineage > 0) return 0
  if (LINEAGE_SUGGESTED_PATH[candidate.lineage] === targetPath) return 1
  return 2
}

/**
 * The three "Recommended for your Path" slots (B1–B8), over a {@link buildLineageAtlas}
 * view. Slot 1 is the best actionable node in the Origin Lineage (badged
 * `origin-lineage`). Slots 2–3 (and slot 1 when the Origin offers nothing) draw from
 * the fill pool in strict {@link fillPriority} order. Never more than 3, never a
 * repeat; fewer eligible picks ⇒ a shorter list. Saved Ranks don't gate the list
 * except at the level ceiling with zero saved ranks (B2). Curried deps-first.
 */
export function getAtlasRecommendations(deps: Pick<GameData, "getSkill">) {
  return (
    view: LineageAtlasView,
    pathChoice: PathChoice,
    level: number
  ): AtlasRecommendation[] => {
    if (view.savedRanks === 0 && level >= MAX_LEVEL) return []

    const accessible = accessibleDamageTypes(view, deps.getSkill)

    const candidates: RecommendationCandidate[] = view.lineages.flatMap(
      (lineage) =>
        lineage.columns
          .flatMap((column) => column.nodes)
          .filter(isRecommendable)
          .map((node) => ({
            node,
            lineage: lineage.lineage,
            ownedInLineage: lineage.progress.owned,
            introducesNewDamageType: archetypeDamageTypes(
              node.archetype,
              deps.getSkill
            ).some((type) => !accessible.has(type)),
          }))
    )

    const targetPath = SUGGESTED_PATH_BY_CHOICE[pathChoice]

    const toRecommendation = (
      candidate: RecommendationCandidate
    ): AtlasRecommendation => ({
      archetype: candidate.node.archetype,
      state: candidate.node.state,
      ownedKey: candidate.node.ownedKey,
      reason:
        candidate.lineage === view.originLineage
          ? "origin-lineage"
          : candidate.ownedInLineage > 0
            ? "unlocked-archetype"
            : LINEAGE_SUGGESTED_PATH[candidate.lineage] === targetPath
              ? "fits-path"
              : "new-damage-type",
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

    const fillCandidates = candidates
      .filter(
        (candidate) =>
          !used.has(candidate.node.archetype.key) &&
          (candidate.ownedInLineage > 0 ||
            LINEAGE_SUGGESTED_PATH[candidate.lineage] === targetPath ||
            candidate.introducesNewDamageType)
      )
      .sort(
        (a, b) =>
          fillPriority(a, targetPath) - fillPriority(b, targetPath) ||
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
}
