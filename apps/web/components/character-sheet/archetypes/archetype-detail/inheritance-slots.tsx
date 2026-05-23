import { ItemGroup } from "@workspace/ui/components/item"

import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"

import { DetailSection } from "../../shared/detail-section"
import { SkillRow } from "../../skill-row"

export function ArchetypeInheritanceSlots({
  entry,
}: {
  entry: ArchetypeEntry
}) {
  const { archetype, slots } = entry
  if (archetype.inheritanceSlots === 0) return null

  const total = archetype.inheritanceSlots
  const filled = slots.filter((slot) => slot.resolved !== null).length
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex)

  return (
    <DetailSection
      title="Inheritance Slots"
      aside={
        <span className="text-xs text-muted-foreground tabular-nums">
          {filled}/{total} filled
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {Array.from({ length: total }).map((_, slotIndex) => {
          const slot = ordered.find((s) => s.slotIndex === slotIndex)
          return (
            <li
              key={slotIndex}
              className="rounded-none border border-border p-3"
            >
              {slot?.resolved ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Slot {slotIndex + 1}
                    {slot.sourceArchetype
                      ? ` · from ${slot.sourceArchetype.name}`
                      : null}
                  </p>
                  <ItemGroup className="gap-0">
                    <SkillRow skill={slot.resolved} />
                  </ItemGroup>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground">
                    Slot {slotIndex + 1}
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Empty slot
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </DetailSection>
  )
}
