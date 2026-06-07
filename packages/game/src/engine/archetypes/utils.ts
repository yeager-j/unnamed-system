import { getArchetype } from "@workspace/game/data/archetypes/registry"
import { getSkill } from "@workspace/game/data/skills/registry"
import { isInheritableSkill } from "@workspace/game/engine/archetypes/inheritance"
import { toStatContext } from "@workspace/game/engine/character/stats/stat-character"
import {
  baseAffinitiesForArchetype,
  baseAttributesForArchetype,
  computeMaxHP,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"
import {
  resolveAttackRoll,
  skillAttackRollContext,
  type ResolvedAttackRoll,
} from "@workspace/game/engine/combat/attack-roll"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import { hydrateSkill } from "@workspace/game/engine/skills/utils"
import {
  ARCHETYPE_TIERS,
  type Archetype,
  type ArchetypeTier,
} from "@workspace/game/foundation/archetypes/schema"
import {
  type HydratedCharacter,
  type HydratedSkill,
} from "@workspace/game/foundation/character/hydrated-character"
import {
  LINEAGE_SUGGESTED_PATH,
  LINEAGES,
  type Lineage,
  type SuggestedPath,
} from "@workspace/game/foundation/character/lineage"
import type { CharacterArchetypeRow } from "@workspace/game/foundation/character/records"
import { type PathChoice } from "@workspace/game/foundation/character/state"
import { type Skill } from "@workspace/game/foundation/skills/schema"

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
 *
 * `isValid` is `false` only for a *configured* slot whose Skill the source
 * Archetype's **current** Rank no longer makes inheritable (data drift, or a
 * Rank that dropped below the picked Skill). The picker prevents writing an
 * invalid slot; this flag lets the read side surface a pre-existing one and
 * prompt re-selection rather than silently dropping it. Empty slots are valid.
 */
export interface ResolvedInheritanceSlot {
  slotIndex: number
  /** The source `characterArchetype` row id the slot points at (raw stored
   *  value); `null` for an empty slot. The owner-mode picker keys its
   *  selected-state on this. */
  sourceCharacterArchetypeId: string | null
  /** The raw stored Skill key; `null` for an empty slot. */
  skillKey: string | null
  sourceArchetype: Archetype | null
  resolved: HydratedSkill | null
  isValid: boolean
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
  stats: StatContext,
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
 * the live sheet passes the character's hydrated `stats`/`maxHP`/party, the
 * builder preview passes a synthetic Rank-2, equipment-less character. Skill
 * references whose `skillKey` no longer resolves are dropped.
 */
function resolveArchetypeRankedSkills(
  archetype: Archetype,
  maxHP: number,
  stats: StatContext,
  partyComposition: HydratedCharacter["partyComposition"]
): { ranks: RankedSkill[]; synthesis: RankedSkill | null } {
  const resolveByKey = (key: string): HydratedSkill | null => {
    const skill = getSkill(key)
    // Stryker disable next-line ConditionalExpression: equivalent — resolveByKey is only ever called with an Archetype's own skill / synthesis keys, all of which the registry validator guarantees resolve.
    if (!skill) return null
    return hydrateSkill(
      skill,
      maxHP,
      resolveAttackRollForSkill(skill, stats, partyComposition)
    )
  }

  const ranks: RankedSkill[] = archetype.skills.flatMap((reference) => {
    const resolved = resolveByKey(reference.skill)
    // Stryker disable next-line ConditionalExpression,ArrayDeclaration: equivalent — every Archetype skill key resolves (registry validator), so resolved is never null and the drop-branch is dead.
    if (!resolved) return []
    return [{ ...resolved, rank: reference.rank }]
  })

  const synthesisReference = archetype.synthesisSkill
  const synthesisResolved = synthesisReference
    ? resolveByKey(synthesisReference.skill)
    : null
  const synthesis: RankedSkill | null =
    // Stryker disable next-line LogicalOperator: equivalent — synthesisResolved is non-null exactly when synthesisReference is truthy (a synthesis skill key is a SkillKey, so it always resolves), so `&&` and `||` always select the same branch.
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
  const stats = toStatContext(character)

  const archetypeByRowId = new Map<string, Archetype>()
  const rowById = new Map<string, CharacterArchetypeRow>()
  for (const row of character.archetypeRows) {
    rowById.set(row.id, row)
    const archetype = getArchetype(row.archetypeKey)
    // Stryker disable next-line ConditionalExpression: equivalent — setting an undefined archetype is indistinguishable from not setting it: every reader (`.get(id)` with `if (!archetype) return []` and `.get(id) ?? null`) treats a missing key and an undefined value identically.
    if (archetype) archetypeByRowId.set(row.id, archetype)
  }

  function resolveSkillByKey(key: string): HydratedSkill | null {
    const skill = getSkill(key)
    if (!skill) return null
    return hydrateSkill(
      skill,
      character.maxHP,
      resolveAttackRollForSkill(skill, stats, character.partyComposition)
    )
  }

  return character.archetypeRows.flatMap((row) => {
    const archetype = archetypeByRowId.get(row.id)
    if (!archetype) return []

    const { ranks, synthesis } = resolveArchetypeRankedSkills(
      archetype,
      character.maxHP,
      stats,
      character.partyComposition
    )

    const slots: ResolvedInheritanceSlot[] = row.inheritanceSlots.map(
      (slot) => {
        const sourceRow = slot.sourceCharacterArchetypeId
          ? rowById.get(slot.sourceCharacterArchetypeId)
          : undefined
        const sourceArchetype = sourceRow
          ? (archetypeByRowId.get(sourceRow.id) ?? null)
          : null
        const isValid =
          slot.skillKey === null
            ? true
            : sourceArchetype !== null &&
              isInheritableSkill(
                sourceArchetype,
                sourceRow!.rank,
                slot.skillKey
              )
        return {
          slotIndex: slot.slotIndex,
          sourceCharacterArchetypeId: slot.sourceCharacterArchetypeId,
          skillKey: slot.skillKey,
          sourceArchetype,
          resolved: slot.skillKey ? resolveSkillByKey(slot.skillKey) : null,
          isValid,
        }
      }
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

const LINEAGE_ORDER: Record<Lineage, number> = Object.fromEntries(
  LINEAGES.map((lineage, index) => [lineage, index])
) as Record<Lineage, number>

const TIER_ORDER = Object.fromEntries(
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
) as Record<(typeof ARCHETYPE_TIERS)[number], number>

export interface ArchetypeDisplay {
  activeEntry: ArchetypeEntry | null
}

/**
 * Shapes the data the {@link Archetypes} tab needs: the active Archetype entry
 * (if one is set). The tab's flat unlocked-by-Lineage list was retired in favor
 * of the Lineage Atlas (UNN-276), so the spotlight is all that remains. Pure —
 * wraps {@link buildArchetypeEntries} so the tab orchestrator stays focused on
 * layout.
 */
export function getArchetypeDisplay(
  character: HydratedCharacter
): ArchetypeDisplay {
  const entries = buildArchetypeEntries(character)
  return {
    activeEntry: entries.find((entry) => entry.isActive) ?? null,
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
 * on every owner sheet. Groups follow the rulebook's canonical Lineage order
 * (and Tier-then-name order within a Lineage); Lineages with no unlocked
 * Archetype are omitted.
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
        ? // Stryker disable next-line OptionalChaining: equivalent — the registry validator rejects any Archetype whose mechanic key does not resolve, so getMechanic is never undefined here.
          (getMechanic(archetype.mechanic)?.displayName ?? null)
        : null,
    })
    grouped.set(archetype.lineage, bucket)
  }

  return [...grouped.entries()]
    .map<ArchetypeSwitcherGroup>(([lineage, options]) => ({
      lineage,
      // Stryker disable MethodExpression,BlockStatement,ArithmeticOperator,ConditionalExpression,EqualityOperator: equivalent — every shipped Archetype is its own Lineage, so two options in one bucket are rows of the SAME Archetype with identical tier and name; the within-bucket tier/name comparator can never observably reorder them.
      options: [...options].sort((a, b) => {
        const tierDelta = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
        if (tierDelta !== 0) return tierDelta
        return a.name.localeCompare(b.name)
      }),
      // Stryker restore MethodExpression,BlockStatement,ArithmeticOperator,ConditionalExpression,EqualityOperator
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
 * {@link StatContext} carrying the player's already-picked
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
  const stats: StatContext = {
    pathChoice,
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: archetype.key,
    // Stryker disable next-line ArrayDeclaration,ObjectLiteral: equivalent — `baseAttributes` (below) independently drives the attribute computation, so emptying/blanking this `archetypes` entry leaves the previewed Archetype's attributes, maxHP, and Attack Rolls unchanged.
    archetypes: [{ key: archetype.key, rank: 2 }],
    equippedItems: [],
    // Stryker disable next-line ArrayDeclaration: equivalent — a junk activeSkills entry resolves to no passive, so it never changes the resolved cost or Attack Roll the preview surfaces.
    activeSkills: [],
    activeMechanic: null,
    baseAttributes: baseAttributesForArchetype(archetype.key),
    baseAffinities: baseAffinitiesForArchetype(archetype.key),
  }
  return resolveArchetypeRankedSkills(
    archetype,
    computeMaxHP(stats),
    stats,
    null
  )
}
