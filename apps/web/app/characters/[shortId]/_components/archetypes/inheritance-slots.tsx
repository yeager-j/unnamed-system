"use client"

import { PlusIcon, WarningIcon } from "@phosphor-icons/react"
import { useState } from "react"

import type {
  ArchetypeEntry,
  ResolvedInheritanceSlot,
} from "@workspace/game-v2/archetypes/display"
import {
  inheritanceSourceGroups,
  type InheritanceSourceGroup,
} from "@workspace/game-v2/archetypes/inheritance"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { ItemGroup } from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { buildSkillCardView } from "@/domain/combat/view/skill-card-view"
import {
  useEntityWrite,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { resolveArchetypeRoster } from "@/domain/game-engine-v2"
import { LINEAGE_LABELS } from "@/domain/labels"

/**
 * The active Archetype's Inheritance Slots (S2d — UNN-560; rulebook 1.3). Each
 * slot holds a Skill inherited from **another** unlocked Archetype, chosen from
 * that source's Skills available at the character's current Rank in it — the
 * engine threads the active Archetype's slots into the Combat-tab Skills list.
 * Every viewer sees the filled/empty slots; the owner additionally gets the
 * per-slot **Assign / Change / Clear** controls, each dispatching a
 * `setInheritanceSlot` descriptor (keyed by Archetype key — D36).
 *
 * The owner controls live here in the sheet feature (not the neutral
 * `components/archetype/` kit) because they read the write hooks; `attributes`
 * flows through to the inherited Skill's popover.
 */
export function InheritanceSlots({
  entry,
  attributes,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
}) {
  const total = entry.archetype.inheritanceSlots
  const { resolved } = useLoadedCharacter()
  const isOwner = useViewerRole() === "owner"

  // Resolve the picker's source groups once for the whole block — every slot
  // shares them, and the resolution re-hydrates every other Archetype's Skills.
  // Owner-only: a read-only viewer renders no picker, so it pays nothing.
  const sourceGroups: InheritanceSourceGroup[] = isOwner
    ? inheritanceSourceGroups(resolveArchetypeRoster(resolved), entry.key)
    : []

  if (total === 0) return null

  const filled = entry.slots.filter((slot) => slot.resolved !== null).length

  return (
    <DetailSection
      title="Inheritance Slots"
      aside={
        <span className="text-xs text-muted-foreground tabular-nums">
          {filled} / {total} filled
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {Array.from({ length: total }).map((_, slotIndex) => (
          <SlotRow
            key={slotIndex}
            ownerKey={entry.key}
            slot={entry.slots.find((s) => s.slotIndex === slotIndex) ?? null}
            slotIndex={slotIndex}
            attributes={attributes}
            sourceGroups={sourceGroups}
          />
        ))}
      </ul>
    </DetailSection>
  )
}

function SlotRow({
  ownerKey,
  slot,
  slotIndex,
  attributes,
  sourceGroups,
}: {
  ownerKey: string
  slot: ResolvedInheritanceSlot | null
  slotIndex: number
  attributes: AttributeScores
  sourceGroups: InheritanceSourceGroup[]
}) {
  const { dispatch } = useEntityWrite()
  const invalid = slot !== null && !slot.isValid
  const filled = slot?.resolved != null

  const clear = () =>
    dispatch({
      component: "archetypes",
      op: "setInheritanceSlot",
      archetypeKey: ownerKey,
      slotIndex,
      sourceArchetypeKey: null,
      skillKey: null,
    })

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span>Slot {slotIndex + 1}</span>
          {slot?.sourceArchetype ? (
            <span>· from {LINEAGE_LABELS[slot.sourceArchetype.lineage]}</span>
          ) : null}
          {invalid ? (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/50 py-0 text-destructive"
            >
              <WarningIcon weight="bold" className="size-3" aria-hidden />
              <span className="sr-only">Inherited talent unavailable: </span>
              Re-select
            </Badge>
          ) : null}
        </p>
        <OwnerOnly>
          <div className="flex shrink-0 items-center gap-1.5">
            <SlotPicker
              ownerKey={ownerKey}
              slotIndex={slotIndex}
              sourceGroups={sourceGroups}
              filled={filled}
            />
            {filled ? (
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
            ) : null}
          </div>
        </OwnerOnly>
      </div>
      {slot?.resolved ? (
        <ItemGroup className="gap-0">
          <ResolvedSkillRow
            view={buildSkillCardView(slot.resolved, attributes)}
          />
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground italic">Empty slot</p>
      )}
      {invalid ? (
        <p className="text-xs text-destructive">
          The source Archetype&rsquo;s Rank no longer unlocks this Skill.
        </p>
      ) : null}
    </li>
  )
}

/**
 * Owner-mode picker for one slot: a source-Archetype-grouped Command listing
 * every inheritable Skill. Selecting dispatches `setInheritanceSlot` through
 * the optimistic pipeline, so the Combat Skills list re-derives in the same
 * frame when this Archetype is active. "Assign Skill" for an empty slot,
 * "Change" for a filled one (Clear is a sibling button in {@link SlotRow}).
 */
function SlotPicker({
  ownerKey,
  slotIndex,
  sourceGroups,
  filled,
}: {
  ownerKey: string
  slotIndex: number
  sourceGroups: InheritanceSourceGroup[]
  filled: boolean
}) {
  const { dispatch } = useEntityWrite()
  const [open, setOpen] = useState(false)

  const assign = (sourceArchetypeKey: string, skillKey: string) => {
    setOpen(false)
    dispatch({
      component: "archetypes",
      op: "setInheritanceSlot",
      archetypeKey: ownerKey,
      slotIndex,
      sourceArchetypeKey,
      skillKey,
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="sm" variant={filled ? "ghost" : "outline"} />}
      >
        {filled ? (
          "Change"
        ) : (
          <>
            <PlusIcon aria-hidden />
            Assign Skill
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search Skills…" />
          <CommandList>
            <CommandEmpty>No inheritable Skill.</CommandEmpty>
            {sourceGroups.map((group) => (
              <CommandGroup
                key={group.sourceArchetypeKey}
                heading={`${group.archetype.name} · ${LINEAGE_LABELS[group.archetype.lineage]}`}
              >
                {group.skills.map((ranked) => (
                  <CommandItem
                    key={ranked.skill.key}
                    value={`${group.archetype.name} ${ranked.skill.name}`}
                    onSelect={() =>
                      assign(group.sourceArchetypeKey, ranked.skill.key)
                    }
                  >
                    {ranked.skill.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
