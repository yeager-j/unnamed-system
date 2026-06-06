import { unmetPrerequisites } from "../../archetypes/atlas"
import { MASTERY_RANK } from "../../archetypes/rank"
import { ARCHETYPES } from "../../archetypes/registry"
import type { Archetype } from "../../archetypes/schema"
import type { ArchetypeEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import { patchRow, type SliceResult } from "./shared"

/**
 * Archetypes slice: switching the active Archetype, configuring an Inheritance
 * Slot, and spending Saved Archetype Ranks in the Lineage Atlas (unlocking a
 * new Archetype, ranking up an owned one).
 *
 * Switching patches a single column; a slot change merges into the owning
 * `characterArchetype` row's `inheritanceSlots` array — the server reads and
 * merges the same way — so a change on the *active* Archetype re-threads the
 * Combat Skills list in the same optimistic frame while a change on an inactive
 * one persists without touching it.
 *
 * Unlock / rank-up mirror the server guards exactly (unknown Archetype, already
 * owned, unmet prerequisites, at the Mastery Rank, no Saved Rank) so a rejected
 * spend is a no-op (`null`) and the optimistic frame never advances past what
 * the write will commit.
 */
export function reduceArchetypeEdit(
  raw: RawCharacterInputs,
  edit: ArchetypeEdit,
  newId: () => string,
  catalog: readonly Archetype[] = ARCHETYPES
): SliceResult {
  switch (edit.kind) {
    case "switchActiveArchetype":
      return patchRow(raw, { activeArchetypeId: edit.characterArchetypeId })

    case "setInheritanceSlot":
      return reduceInheritanceSlot(raw, edit)

    case "unlockArchetype":
      return reduceUnlockArchetype(raw, edit, newId, catalog)

    case "rankUpArchetype":
      return reduceRankUpArchetype(raw, edit)
  }
}

function reduceInheritanceSlot(
  raw: RawCharacterInputs,
  edit: Extract<ArchetypeEdit, { kind: "setInheritanceSlot" }>
): SliceResult {
  let changed = false
  const archetypeRows = raw.archetypeRows.map((archetype) => {
    if (archetype.id !== edit.characterArchetypeId) return archetype
    changed = true
    const others = archetype.inheritanceSlots.filter(
      (slot) => slot.slotIndex !== edit.slotIndex
    )
    return {
      ...archetype,
      inheritanceSlots: [
        ...others,
        {
          slotIndex: edit.slotIndex,
          sourceCharacterArchetypeId: edit.sourceCharacterArchetypeId,
          skillKey: edit.skillKey,
        },
      ],
    }
  })

  return changed ? { ...raw, archetypeRows } : null
}

/**
 * Appends a freshly-unlocked Archetype at Rank 1 and spends one Saved Rank. The
 * optimistic row mirrors the DB insert (empty Inheritance Slots, null mechanic
 * state); the server's revalidate later replaces the minted id. No-op when the
 * Archetype is unknown, already owned, has unmet prerequisites, or no Saved Rank
 * is available — the same guards the server enforces. `catalog` defaults to the
 * full {@link ARCHETYPES} registry; it is a parameter so tests can inject a
 * fixture catalog whose Archetypes carry prerequisites (the shipped roster does
 * not), exercising the prerequisite guard.
 */
function reduceUnlockArchetype(
  raw: RawCharacterInputs,
  edit: Extract<ArchetypeEdit, { kind: "unlockArchetype" }>,
  newId: () => string,
  catalog: readonly Archetype[]
): SliceResult {
  const byKey = new Map(catalog.map((archetype) => [archetype.key, archetype]))
  const archetype = byKey.get(edit.archetypeKey)
  if (!archetype) return null

  const alreadyOwned = raw.archetypeRows.some(
    (row) => row.archetypeKey === edit.archetypeKey
  )
  if (alreadyOwned || raw.row.savedArchetypeRanks <= 0) return null

  const ownedRankByKey = new Map(
    raw.archetypeRows
      .filter((row) => byKey.has(row.archetypeKey))
      .map((row) => [row.archetypeKey, row.rank] as const)
  )
  if (unmetPrerequisites(archetype, ownedRankByKey).length > 0) return null

  return {
    ...raw,
    row: { ...raw.row, savedArchetypeRanks: raw.row.savedArchetypeRanks - 1 },
    archetypeRows: [
      ...raw.archetypeRows,
      {
        id: newId(),
        characterId: raw.row.id,
        archetypeKey: edit.archetypeKey,
        rank: 1,
        inheritanceSlots: [],
        mechanicState: null,
      },
    ],
  }
}

/**
 * Increments one owned Archetype's Rank by one and spends a Saved Rank — so a
 * rank-up on the *active* Archetype re-threads its Combat-tab Skills in the same
 * frame and crossing Rank 5 surfaces Mastery (both fall out of the re-derive).
 * No-op when the row is unknown, already at the Mastery Rank, or no Saved Rank
 * is available.
 */
function reduceRankUpArchetype(
  raw: RawCharacterInputs,
  edit: Extract<ArchetypeEdit, { kind: "rankUpArchetype" }>
): SliceResult {
  const target = raw.archetypeRows.find(
    (archetype) => archetype.id === edit.characterArchetypeId
  )
  if (
    !target ||
    target.rank >= MASTERY_RANK ||
    raw.row.savedArchetypeRanks <= 0
  ) {
    return null
  }

  return {
    ...raw,
    row: { ...raw.row, savedArchetypeRanks: raw.row.savedArchetypeRanks - 1 },
    archetypeRows: raw.archetypeRows.map((archetype) =>
      archetype.id === edit.characterArchetypeId
        ? { ...archetype, rank: archetype.rank + 1 }
        : archetype
    ),
  }
}
