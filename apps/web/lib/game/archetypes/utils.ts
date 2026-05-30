import type { CharacterArchetypeRow } from "@/lib/db/schema/character"

import {
  computeMaxHP,
  computeMaxSP,
  LINEAGE_SUGGESTED_PATH,
  toStatComputationCharacter,
  type HydratedCharacter,
  type HydratedSkill,
  type PathChoice,
  type StatComputationCharacter,
  type SuggestedPath,
} from "../character"
import {
  resolveAttackRoll,
  skillAttackRollContext,
  type ResolvedAttackRoll,
} from "../combat"
import { getMechanic } from "../mechanics"
import {
  getSkill,
  hydrateSkill,
  type CastingCharacter,
  type Skill,
} from "../skills"
import { getArchetype } from "./registry"
import {
  ARCHETYPE_TIERS,
  LINEAGES,
  type Archetype,
  type ArchetypeTier,
  type Lineage,
} from "./schema"

/**
 * Per-character resolution of an unlocked Archetype: the catalog entry, the
 * persisted row, the active-flag, the Rank-keyed Skills paired with their
 * resolved costs, the Synthesis Skill (if declared), and every Inheritance
 * Slot resolved against the character's other Archetype rows. Pure domain
 * shaping — every display surface (the Archetypes tab today; future
 * level-up summaries, server actions, the public sheet) consumes the same
 * pre-resolved bundle without re-doing the catalog lookups or cost work.
 */

/** A {@link HydratedSkill} tagged with the Archetype Rank it unlocks at. */
export type RankedSkill = HydratedSkill & { rank: number }

/**
 * An Inheritance Slot resolved against the character's other Archetype rows:
 * `sourceArchetype` is the catalog entry the slot draws from (`null` when
 * the slot is empty or its source row no longer exists), and `resolved` is
 * the filling Skill + cost (`null` when the slot is empty or its `skillKey`
 * no longer resolves). Both `null` ⇒ a vacant slot the detail block renders
 * as "Empty slot".
 */
export interface ResolvedInheritanceSlot {
  slotIndex: number
  sourceArchetype: Archetype | null
  resolved: HydratedSkill | null
}

/**
 * Everything any per-Archetype surface needs for one unlocked Archetype,
 * with cross-references already resolved against the rest of the hydrated
 * character. Built once so multiple views can consume the same pre-resolved
 * values without re-doing lookups.
 */
export interface ArchetypeEntry {
  archetype: Archetype
  row: CharacterArchetypeRow
  isActive: boolean
  /** Every Rank-keyed Skill the Archetype declares, sorted by Rank ascending. */
  ranks: RankedSkill[]
  /**
   * The Archetype's Synthesis Skill resolved to a {@link RankedSkill}, or
   * `null` when the Archetype declares none. Consumers decide whether to
   * *show* it based on `rank ≤ row.rank` — the field carries every Synthesis
   * Skill the Archetype declares so the schema can later widen to multiple
   * without changing this shape.
   */
  synthesis: RankedSkill | null
  /** Per-slot resolution; length equals `archetype.inheritanceSlots`. */
  slots: ResolvedInheritanceSlot[]
}

function resolveAttackRollForSkill(
  skill: Skill,
  stats: StatComputationCharacter,
  partyComposition: HydratedCharacter["partyComposition"]
): ResolvedAttackRoll | null {
  const context = skillAttackRollContext(skill)
  if (!context) return null
  return resolveAttackRoll(context, stats, partyComposition)
}

/**
 * Resolves an Archetype's Rank-keyed Skills and Synthesis Skill into the
 * {@link RankedSkill} shape both the live display and the builder preview
 * consume. The only thing that varies between call sites is the source stats:
 * the live sheet passes the character's hydrated `stats`/`casting`/party, the
 * builder preview passes a synthetic Rank-2, equipment-less character. Skill
 * references whose `skillKey` no longer resolves are dropped.
 */
function resolveArchetypeRankedSkills(
  archetype: Archetype,
  casting: CastingCharacter,
  stats: StatComputationCharacter,
  partyComposition: HydratedCharacter["partyComposition"]
): { ranks: RankedSkill[]; synthesis: RankedSkill | null } {
  const resolveByKey = (key: string): HydratedSkill | null => {
    const skill = getSkill(key)
    if (!skill) return null
    return hydrateSkill(
      skill,
      casting,
      resolveAttackRollForSkill(skill, stats, partyComposition)
    )
  }

  const ranks: RankedSkill[] = archetype.skills.flatMap((reference) => {
    const resolved = resolveByKey(reference.skill)
    if (!resolved) return []
    return [{ ...resolved, rank: reference.rank }]
  })

  const synthesisReference = archetype.synthesisSkill
  const synthesisResolved = synthesisReference
    ? resolveByKey(synthesisReference.skill)
    : null
  const synthesis: RankedSkill | null =
    synthesisReference && synthesisResolved
      ? { ...synthesisResolved, rank: synthesisReference.rank }
      : null

  return { ranks, synthesis }
}

/**
 * Resolves the hydrated character's Archetype rows into pre-resolved
 * {@link ArchetypeEntry} bundles — Skill catalog lookups, Skill-cost
 * resolution against the character's current max HP, and inheritance-slot
 * source-Archetype resolution all happen once here. Rows whose
 * `archetypeKey` no longer resolves to a catalog entry are skipped (data
 * drift after a deploy).
 */
export function buildArchetypeEntries(
  character: HydratedCharacter
): ArchetypeEntry[] {
  const stats = toStatComputationCharacter(character)
  const casting: CastingCharacter = {
    ...stats,
    currentHP: character.currentHP,
    currentSP: character.currentSP,
  }

  const archetypeByRowId = new Map<string, Archetype>()
  for (const row of character.archetypeRows) {
    const archetype = getArchetype(row.archetypeKey)
    if (archetype) archetypeByRowId.set(row.id, archetype)
  }

  function resolveSkillByKey(key: string): HydratedSkill | null {
    const skill = getSkill(key)
    if (!skill) return null
    return hydrateSkill(
      skill,
      casting,
      resolveAttackRollForSkill(skill, stats, character.partyComposition)
    )
  }

  return character.archetypeRows.flatMap((row) => {
    const archetype = archetypeByRowId.get(row.id)
    if (!archetype) return []

    const { ranks, synthesis } = resolveArchetypeRankedSkills(
      archetype,
      casting,
      stats,
      character.partyComposition
    )

    const slots: ResolvedInheritanceSlot[] = row.inheritanceSlots.map(
      (slot) => ({
        slotIndex: slot.slotIndex,
        sourceArchetype: slot.sourceCharacterArchetypeId
          ? (archetypeByRowId.get(slot.sourceCharacterArchetypeId) ?? null)
          : null,
        resolved: slot.skillKey ? resolveSkillByKey(slot.skillKey) : null,
      })
    )

    return [
      {
        archetype,
        row,
        isActive: row.id === character.activeArchetypeId,
        ranks,
        synthesis,
        slots,
      },
    ]
  })
}

export interface LineageGroup {
  lineage: Lineage
  entries: ArchetypeEntry[]
}

const LINEAGE_ORDER: Record<Lineage, number> = Object.fromEntries(
  LINEAGES.map((lineage, index) => [lineage, index])
) as Record<Lineage, number>

const TIER_ORDER = Object.fromEntries(
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
) as Record<(typeof ARCHETYPE_TIERS)[number], number>

/**
 * Groups Archetype entries by Lineage in the rulebook's canonical Lineage
 * order, then by Tier within each Lineage (initiate → paragon, then by key).
 * Skips Lineages with no unlocked Archetypes — the Lineage list is a player
 * progress view, not a catalog teaser.
 */
export function groupByLineage(entries: ArchetypeEntry[]): LineageGroup[] {
  const grouped = new Map<Lineage, ArchetypeEntry[]>()
  for (const entry of entries) {
    const bucket = grouped.get(entry.archetype.lineage) ?? []
    bucket.push(entry)
    grouped.set(entry.archetype.lineage, bucket)
  }

  return [...grouped.entries()]
    .map<LineageGroup>(([lineage, groupEntries]) => ({
      lineage,
      entries: [...groupEntries].sort((a, b) => {
        const tierDelta =
          TIER_ORDER[a.archetype.tier] - TIER_ORDER[b.archetype.tier]
        if (tierDelta !== 0) return tierDelta
        return a.archetype.key.localeCompare(b.archetype.key)
      }),
    }))
    .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])
}

export interface ArchetypeDisplay {
  activeEntry: ArchetypeEntry | null
  lineageGroups: LineageGroup[]
  unlockedCount: number
}

/**
 * Shapes the data the {@link Archetypes} tab needs: the active Archetype
 * entry (if one is set), every unlocked entry grouped by Lineage in canonical
 * order, and the total unlocked count. Pure — wraps the existing
 * {@link buildArchetypeEntries} / {@link groupByLineage} pair so the tab
 * orchestrator stays focused on layout.
 */
export function getArchetypeDisplay(
  character: HydratedCharacter
): ArchetypeDisplay {
  const entries = buildArchetypeEntries(character)
  return {
    activeEntry: entries.find((entry) => entry.isActive) ?? null,
    lineageGroups: groupByLineage(entries),
    unlockedCount: entries.length,
  }
}

/** One unlocked Archetype as the header switcher shows it: the catalog facts a
 *  player weighs when switching (name, Tier, current Rank, Mechanic name),
 *  keyed by the `characterArchetype` row id the switch write targets. */
export interface ArchetypeSwitcherOption {
  id: string
  name: string
  tier: ArchetypeTier
  rank: number
  mechanicName: string | null
}

/** Unlocked Archetypes for one Lineage, in the header switcher. */
export interface ArchetypeSwitcherGroup {
  lineage: Lineage
  options: ArchetypeSwitcherOption[]
}

/**
 * Lineage-grouped options for the header's active-Archetype switcher (UNN-238).
 * Unlike {@link getArchetypeDisplay} this resolves only the catalog facts the
 * picker renders — no Skill or Inheritance-Slot work — since the switcher sits
 * on every owner sheet. Groups follow the same canonical Lineage order (and
 * Tier-then-name order within a Lineage) as {@link groupByLineage}; Lineages
 * with no unlocked Archetype are omitted.
 */
export function archetypeSwitcherGroups(
  character: HydratedCharacter
): ArchetypeSwitcherGroup[] {
  const grouped = new Map<Lineage, ArchetypeSwitcherOption[]>()
  for (const row of character.archetypeRows) {
    const archetype = getArchetype(row.archetypeKey)
    if (!archetype) continue
    const bucket = grouped.get(archetype.lineage) ?? []
    bucket.push({
      id: row.id,
      name: archetype.name,
      tier: archetype.tier,
      rank: row.rank,
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
        if (tierDelta !== 0) return tierDelta
        return a.name.localeCompare(b.name)
      }),
    }))
    .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])
}

/**
 * Path-responsive ordering for the Movement 1 Archetype grid (UNN-215 / ADR-002
 * §"Order — responsive to Path"). Three buckets keyed on each Lineage's
 * `LINEAGE_SUGGESTED_PATH`; the bucket order rotates so the Path the player
 * picked surfaces first:
 *
 * - `"health-focused"`  → health  → balanced → skill
 * - `"balanced"`        → balanced → health  → skill
 * - `"skill-focused"`   → skill   → balanced → health
 *
 * Within a bucket, Archetypes fall back to the canonical `LINEAGES` array order
 * (the rulebook order).
 *
 * The sort never gates anything — every Archetype stays selectable regardless
 * of Path. An HP-Focused Mage is unusual but valid; the sort is *discovery*,
 * not *restriction*.
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
    if (aBucket !== bBucket) return aBucket - bBucket
    return LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage]
  })
}

/**
 * Catalog-only preview of an Archetype's Skills (PRD §5.1 — builder Step 2).
 *
 * Resolves every Rank-keyed Skill reference (and the Synthesis Skill) into the
 * `RankedSkill` shape the shared archetype display components consume.
 *
 * `resolvedCost` and `resolvedAttackRoll` are both computed against a synthetic
 * {@link StatComputationCharacter} carrying the player's already-picked
 * `pathChoice` and the previewed Archetype at Rank 2 (Origin's auto-assigned
 * Rank, PRD §5.1) — no equipment, no other Archetypes, no Mastery yet. That
 * yields the same concrete readout the live-sheet popover does once the
 * character is created, so the player sees `"1 HP"` and `"Attack Roll +2"`
 * instead of `"5% HP"` and a missing Attack-Roll section. Switching path
 * re-resolves on the next server revalidate.
 */
export function previewArchetypeSkills(
  archetype: Archetype,
  pathChoice: PathChoice
): { ranks: RankedSkill[]; synthesis: RankedSkill | null } {
  const stats: StatComputationCharacter = {
    pathChoice,
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: archetype.key,
    archetypes: [{ key: archetype.key, rank: 2 }],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
  }
  const casting: CastingCharacter = {
    ...stats,
    currentHP: computeMaxHP(stats),
    currentSP: computeMaxSP(stats),
  }

  return resolveArchetypeRankedSkills(archetype, casting, stats, null)
}
