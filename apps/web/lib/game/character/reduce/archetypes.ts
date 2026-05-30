import type { ArchetypeEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import { patchRow, type SliceResult } from "./shared"

/**
 * Archetypes slice: switching the active Archetype and configuring an
 * Inheritance Slot. Switching patches a single column; a slot change merges
 * into the owning `characterArchetype` row's `inheritanceSlots` array — the
 * server reads and merges the same way — so a change on the *active* Archetype
 * re-threads the Combat Skills list in the same optimistic frame while a change
 * on an inactive one persists without touching it. An unknown owner row is a
 * no-op (`null`).
 */
export function reduceArchetypeEdit(
  raw: RawCharacterInputs,
  edit: ArchetypeEdit
): SliceResult {
  if (edit.kind === "switchActiveArchetype") {
    return patchRow(raw, { activeArchetypeId: edit.characterArchetypeId })
  }

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
