import {
  ARCHETYPE_TIERS,
  type Archetype,
  type ArchetypeTier,
} from "@workspace/game-v2/archetypes/archetype"
import type { InheritanceSlot } from "@workspace/game-v2/archetypes/archetypes.schema"
import { ORIGIN_ARCHETYPE_RANK } from "@workspace/game-v2/archetypes/creation"
import { isInheritableSkill } from "@workspace/game-v2/archetypes/inheritance"
import type { ResolvedRosterEntry } from "@workspace/game-v2/archetypes/resolved"
import {
  resolveArchetypeSkill,
  type ResolvedArchetypeSkill,
} from "@workspace/game-v2/archetypes/resolved-skill"
import type {
  PartyComposition,
  ScalerContext,
} from "@workspace/game-v2/combat/party"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type Lineage,
  type PathChoice,
  type SuggestedPath,
} from "@workspace/game-v2/kernel/vocab"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import {
  resolveSkill,
  type ResolvedSkill,
} from "@workspace/game-v2/skills/resolved"

/**
 * Per-Archetype display shaping (ported from v1 `engine/archetypes/utils.ts`),
 * re-homed onto the component model: every function reads the archetype roster off
 * the **`ResolvedEntity`** (the resolved Archetypes read-unit) the sheet already
 * renders — no authored `Entity` threading, no `StatContext`. Skill costs/Attack
 * Rolls resolve on demand against that same resolved entity (C4).
 */

/**
 * An Inheritance Slot resolved against the character's roster: `sourceArchetype` is
 * the catalog entry the slot draws from (`null` when empty or its source key is no
 * longer in the roster), `resolved` the filling Skill (`null` when empty or the
 * `skillKey` no longer resolves). `isValid` is `false` only for a **configured** slot
 * the source's current Rank no longer makes inheritable (or whose source/skill
 * vanished); an empty slot (`skillKey === null`) is always valid (C5). The picker
 * prevents *writing* an invalid slot; this flag surfaces a stale one for re-selection.
 */
export interface ResolvedInheritanceSlot {
  slotIndex: number
  /** The source Archetype **key** the slot points at (v2 keys by key, not row id). */
  sourceArchetypeKey: string | null
  skillKey: string | null
  sourceArchetype: Archetype | null
  resolved: ResolvedSkill | null
  isValid: boolean
}

/**
 * Everything a per-Archetype surface needs for one roster Archetype, cross-references
 * resolved once against the rest of the character. `key`/`rank` come from the roster
 * entry (v2's identity, replacing v1's `characterArchetype` row).
 */
export interface ArchetypeEntry {
  archetype: Archetype
  /** The roster Archetype key (the rank-up / switch write target — C2/C9). */
  key: string
  /** The character's current Rank in this Archetype. */
  rank: number
  isActive: boolean
  /** Every Rank-keyed Skill the Archetype declares, paired with its unlock Rank. */
  ranks: ResolvedArchetypeSkill[]
  /** The Archetype's Synthesis Skill, or `null` when it declares none. */
  synthesis: ResolvedArchetypeSkill | null
  /** Per-slot resolution; length equals the roster entry's `inheritanceSlots`. */
  slots: ResolvedInheritanceSlot[]
}

export interface ArchetypeDisplay {
  activeEntry: ArchetypeEntry | null
}

/** Off-entity inputs to the display resolvers — the party composition the
 *  attack-roll scaler reads (omit ⇒ no party scaling). */
export interface ArchetypeDisplayContext {
  partyComposition?: PartyComposition | null
}

function rankedSkillsOf(
  archetype: Archetype,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null,
  getSkill: GameData["getSkill"]
): {
  ranks: ResolvedArchetypeSkill[]
  synthesis: ResolvedArchetypeSkill | null
} {
  const resolveRef = (
    skillKey: string,
    rank: number
  ): ResolvedArchetypeSkill | null => {
    const skill = getSkill(skillKey)
    return skill ? resolveArchetypeSkill(skill, rank, resolved, scaler) : null
  }

  const ranks = archetype.skills.flatMap((reference) => {
    const resolvedSkill = resolveRef(reference.skill, reference.rank)
    return resolvedSkill ? [resolvedSkill] : []
  })

  const synthesisReference = archetype.synthesisSkill
  const synthesis = synthesisReference
    ? resolveRef(synthesisReference.skill, synthesisReference.rank)
    : null

  return { ranks, synthesis }
}

function scalerFor(
  resolved: ResolvedEntity,
  context?: ArchetypeDisplayContext
): ScalerContext {
  return {
    partyComposition: context?.partyComposition ?? null,
    activeLineage: resolved.components.archetypes?.activeLineage ?? null,
  }
}

function resolveSlots(
  slots: readonly InheritanceSlot[],
  rankByKey: ReadonlyMap<string, number>,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null,
  deps: Pick<GameData, "getArchetype" | "getSkill">
): ResolvedInheritanceSlot[] {
  return slots.map((slot) => {
    const sourceRank = slot.sourceArchetypeKey
      ? rankByKey.get(slot.sourceArchetypeKey)
      : undefined
    // The source must be **owned** (in the roster) AND resolve in the catalog —
    // either gone ⇒ a stale slot (sourceArchetype null, configured slot invalid).
    const sourceArchetype =
      slot.sourceArchetypeKey !== null && sourceRank !== undefined
        ? (deps.getArchetype(slot.sourceArchetypeKey) ?? null)
        : null
    const isValid =
      slot.skillKey === null
        ? true
        : sourceArchetype !== null &&
          sourceRank !== undefined &&
          isInheritableSkill(sourceArchetype, sourceRank, slot.skillKey)
    const filling = slot.skillKey ? deps.getSkill(slot.skillKey) : undefined
    return {
      slotIndex: slot.slotIndex,
      sourceArchetypeKey: slot.sourceArchetypeKey,
      skillKey: slot.skillKey,
      sourceArchetype,
      resolved: filling ? resolveSkill(filling, resolved, scaler) : null,
      isValid,
    }
  })
}

/**
 * Resolves a character's roster into pre-resolved {@link ArchetypeEntry} bundles —
 * Skill lookups, cost resolution against the live `maxHP`, and inheritance-slot
 * source resolution all happen once here, off the {@link ResolvedEntity}. A roster
 * entry whose `key` no longer resolves to a catalog Archetype is skipped (drift).
 * Returns `[]` for an entity with no Archetypes component.
 */
export function buildArchetypeEntries(
  deps: Pick<GameData, "getArchetype" | "getSkill">
) {
  return (
    resolved: ResolvedEntity,
    context?: ArchetypeDisplayContext
  ): ArchetypeEntry[] => {
    const archetypes = resolved.components.archetypes
    if (!archetypes) return []

    const scaler = scalerFor(resolved, context)
    const rankByKey = new Map<string, number>(
      archetypes.roster.map((entry) => [entry.key, entry.rank])
    )

    return archetypes.roster.flatMap((entry: ResolvedRosterEntry) => {
      const archetype = deps.getArchetype(entry.key)
      if (!archetype) return []

      const { ranks, synthesis } = rankedSkillsOf(
        archetype,
        resolved,
        scaler,
        deps.getSkill
      )

      return [
        {
          archetype,
          key: entry.key,
          rank: entry.rank,
          isActive: entry.key === archetypes.active,
          ranks,
          synthesis,
          slots: resolveSlots(
            entry.inheritanceSlots,
            rankByKey,
            resolved,
            scaler,
            deps
          ),
        },
      ]
    })
  }
}

/**
 * Shapes the Archetypes tab: the active Archetype entry (or `null`). Wraps
 * {@link buildArchetypeEntries} so the tab orchestrator stays on layout.
 */
export function getArchetypeDisplay(
  deps: Pick<GameData, "getArchetype" | "getSkill">
) {
  return (
    resolved: ResolvedEntity,
    context?: ArchetypeDisplayContext
  ): ArchetypeDisplay => ({
    activeEntry:
      buildArchetypeEntries(deps)(resolved, context).find(
        (entry) => entry.isActive
      ) ?? null,
  })
}

/** One unlocked Archetype as the header switcher shows it, keyed by the Archetype
 *  **key** the switch write targets (C9). */
export interface ArchetypeSwitcherOption {
  key: string
  name: string
  tier: ArchetypeTier
  rank: number
  mechanicName: string | null
}

export interface ArchetypeSwitcherGroup {
  lineage: Lineage
  options: ArchetypeSwitcherOption[]
}

const LINEAGE_ORDER: Record<Lineage, number> = Object.fromEntries(
  LINEAGES.map((lineage, index) => [lineage, index])
) as Record<Lineage, number>

const TIER_ORDER = Object.fromEntries(
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
) as Record<ArchetypeTier, number>

/**
 * Lineage-grouped options for the header's active-Archetype switcher (C8–C10).
 * Resolves only catalog facts (no Skill/inheritance work) since it sits on every
 * owner sheet. Canonical `LINEAGES` order; Tier-then-name within a Lineage; Lineages
 * with no unlocked Archetype are omitted; a roster key that doesn't resolve is skipped.
 */
export function archetypeSwitcherGroups(deps: Pick<GameData, "getArchetype">) {
  return (resolved: ResolvedEntity): ArchetypeSwitcherGroup[] => {
    const roster = resolved.components.archetypes?.roster ?? []
    const grouped = new Map<Lineage, ArchetypeSwitcherOption[]>()

    for (const entry of roster) {
      const archetype = deps.getArchetype(entry.key)
      if (!archetype) continue
      const bucket = grouped.get(archetype.lineage) ?? []
      bucket.push({
        key: entry.key,
        name: archetype.name,
        tier: archetype.tier,
        rank: entry.rank,
        mechanicName: archetype.mechanic
          ? (getMechanic(archetype.mechanic)?.displayName ?? null)
          : null,
      })
      grouped.set(archetype.lineage, bucket)
    }

    return [...grouped.entries()]
      .map<ArchetypeSwitcherGroup>(([lineage, options]) => ({
        lineage,
        options: [...options].sort((a, b) => {
          const tierDelta = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
          return tierDelta !== 0 ? tierDelta : a.name.localeCompare(b.name)
        }),
      }))
      .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])
  }
}

/**
 * Path-responsive ordering for the builder's Archetype grid (C11). Three buckets
 * keyed on each Lineage's `LINEAGE_SUGGESTED_PATH`, rotated so the picked Path
 * surfaces first; within a bucket, canonical `LINEAGES` order. Never gates
 * selectability — discovery, not restriction. Returns a new array (no mutation).
 */
const BUCKET_ORDER_BY_PATH: Record<
  PathChoice,
  readonly [SuggestedPath, SuggestedPath, SuggestedPath]
> = {
  "health-focused": ["health", "balanced", "skill"],
  balanced: ["balanced", "health", "skill"],
  "skill-focused": ["skill", "balanced", "health"],
}

export function sortArchetypesByPath<T extends Archetype>(
  archetypes: readonly T[],
  pathChoice: PathChoice
): T[] {
  const bucketOrder = BUCKET_ORDER_BY_PATH[pathChoice]
  const bucketRank = {
    [bucketOrder[0]]: 0,
    [bucketOrder[1]]: 1,
    [bucketOrder[2]]: 2,
  } as Record<SuggestedPath, number>

  return archetypes.slice().sort((a, b) => {
    const aBucket = bucketRank[LINEAGE_SUGGESTED_PATH[a.lineage]]
    const bBucket = bucketRank[LINEAGE_SUGGESTED_PATH[b.lineage]]
    return aBucket !== bBucket
      ? aBucket - bBucket
      : LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage]
  })
}

/**
 * Catalog-only preview of an Archetype's Skills (C7 — builder Step 2). Resolves
 * every Rank-keyed Skill (and Synthesis) against a **synthetic Rank-2,
 * equipment-less, single-Archetype** entity carrying the player's already-picked
 * `pathChoice` — Rank 2 is the Origin's auto-rank (below every Mastery rank), so the
 * preview shows concrete readouts ("1 HP", "Attack Roll +2") rather than percent
 * placeholders. Builds the entity, resolves it through the base fold, then runs the
 * same per-skill resolution the live sheet does.
 */
export function previewArchetypeSkills(
  deps: Pick<GameData, "getArchetype" | "getSkill">
) {
  const resolve = createResolve(deps)
  return (
    archetype: Archetype,
    pathChoice: PathChoice
  ): {
    ranks: ResolvedArchetypeSkill[]
    synthesis: ResolvedArchetypeSkill | null
  } => {
    const entity: Entity = {
      id: "preview",
      components: {
        level: { value: 1, victories: 0 },
        path: { choice: pathChoice },
        archetypes: {
          active: archetype.key,
          origin: archetype.key,
          savedArchetypeRanks: 0,
          roster: [
            {
              key: archetype.key,
              rank: ORIGIN_ARCHETYPE_RANK,
              inheritanceSlots: [],
            },
          ],
        },
        attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
        affinities: { base: {} },
        vitals: { base: 0, damage: 0 },
        skillPool: { base: 0, spSpent: 0 },
      },
    }
    const resolved = resolve(entity)
    // No party context in the preview (Rank-2, equipment-less synthetic entity), so
    // the shared constructor's `partyComposition` defaults to null.
    return rankedSkillsOf(
      archetype,
      resolved,
      scalerFor(resolved),
      deps.getSkill
    )
  }
}
