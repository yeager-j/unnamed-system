"use client"

import { WarningIcon } from "@phosphor-icons/react"

import {
  inheritanceSourceGroups,
  type ArchetypeEntry,
  type InheritanceSourceGroup,
  type RankedSkill,
  type ResolvedInheritanceSlot,
} from "@workspace/game/engine"
import { type AttributeScores } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox"
import { ItemGroup } from "@workspace/ui/components/item"

import { DetailSection } from "@/components/shared/detail-section"
import { SkillCostBadge } from "@/components/shared/skill-cost-badge"
import { SkillRow } from "@/components/shared/skill-row"
import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { setInheritanceSlotAction } from "@/lib/actions/inheritance-slots"
import { buildArchetypeEntries } from "@/lib/game-engine"

/**
 * Per-Archetype Inheritance Slots block (PRD §7.8, UNN-241). Each slot holds a
 * Skill inherited from another unlocked Archetype; the engine threads the
 * active Archetype's slots into the Combat-tab Skills list. The read-only view
 * (every viewer) shows each slot's contents or an "Empty slot" placeholder; the
 * owner additionally gets a per-slot {@link SlotPicker} to configure it.
 *
 * The owner controls live here in the sheet feature (not the neutral
 * `components/archetype/` kit) because they read the character-context write
 * hooks. `attributes` flows through to the inherited Skill's popover.
 */
export function InheritanceSlots({
  entry,
  attributes,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
}) {
  const { archetype, slots } = entry
  const total = archetype.inheritanceSlots

  const character = useCharacter()
  const isOwner = useViewerRole() === "owner"
  // Resolve the picker's source groups once for the whole block — every slot
  // shares them. A Paragon-tier Archetype has 6 slots, and the resolution
  // re-hydrates every other Archetype's Skills, so doing it per-SlotPicker
  // would repeat that work 6× (one call site, memoized by the React Compiler).
  // Owner-only: a read-only viewer never renders a picker, so it pays nothing.
  const sourceGroups: InheritanceSourceGroup[] = isOwner
    ? inheritanceSourceGroups(buildArchetypeEntries(character), entry.row.id)
    : []

  if (total === 0) return null

  const filled = slots.filter((slot) => slot.resolved !== null).length

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
        {Array.from({ length: total }).map((_, slotIndex) => (
          <SlotRow
            key={slotIndex}
            ownerEntry={entry}
            slot={slots.find((s) => s.slotIndex === slotIndex) ?? null}
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
  ownerEntry,
  slot,
  slotIndex,
  attributes,
  sourceGroups,
}: {
  ownerEntry: ArchetypeEntry
  slot: ResolvedInheritanceSlot | null
  slotIndex: number
  attributes: AttributeScores
  sourceGroups: InheritanceSourceGroup[]
}) {
  const invalid = slot !== null && !slot.isValid

  return (
    <li className="flex flex-col gap-1.5 rounded-none border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span>Slot {slotIndex + 1}</span>
          {slot?.sourceArchetype ? (
            <span>· from {slot.sourceArchetype.name}</span>
          ) : null}
          {invalid ? (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/50 py-0 text-destructive"
            >
              <WarningIcon weight="bold" className="size-3" aria-hidden />
              Re-select
            </Badge>
          ) : null}
        </p>
        <OwnerOnly>
          <SlotPicker
            ownerEntry={ownerEntry}
            slot={slot}
            slotIndex={slotIndex}
            sourceGroups={sourceGroups}
          />
        </OwnerOnly>
      </div>
      {slot?.resolved ? (
        <ItemGroup className="gap-0">
          <SkillRow skill={slot.resolved} attributes={attributes} />
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

/** A fillable Skill option, or the sentinel that clears the slot. */
type SlotOption =
  | { kind: "empty" }
  | { kind: "skill"; sourceCharacterArchetypeId: string; skill: RankedSkill }

interface PickerGroup {
  id: string
  label: string
  items: SlotOption[]
}

const EMPTY_OPTION: SlotOption = { kind: "empty" }

function optionValue(option: SlotOption): string {
  return option.kind === "empty"
    ? "__empty"
    : `${option.sourceCharacterArchetypeId}:${option.skill.key}`
}

/**
 * Owner-mode picker for one slot: a Lineage-of-source-Archetype-grouped
 * Combobox (the Active-Archetype-switcher pattern) listing every inheritable
 * Skill plus an "Empty slot" clear option. Selecting dispatches the per-slot
 * {@link setInheritanceSlotAction} through the optimistic write pipeline, so the
 * Combat Skills list re-derives in the same frame when this Archetype is active.
 */
function SlotPicker({
  ownerEntry,
  slot,
  slotIndex,
  sourceGroups,
}: {
  ownerEntry: ArchetypeEntry
  slot: ResolvedInheritanceSlot | null
  slotIndex: number
  sourceGroups: InheritanceSourceGroup[]
}) {
  const { pending, write, characterId } = useCharacterWrite()

  const groups: PickerGroup[] = [
    { id: "__clear", label: "Slot", items: [EMPTY_OPTION] },
    ...sourceGroups.map((group) => ({
      id: group.sourceCharacterArchetypeId,
      label: group.archetype.name,
      items: group.skills.map<SlotOption>((skill) => ({
        kind: "skill",
        sourceCharacterArchetypeId: group.sourceCharacterArchetypeId,
        skill,
      })),
    })),
  ]

  const options = groups.flatMap((group) => group.items)
  const current =
    options.find(
      (option) =>
        option.kind === "skill" &&
        option.sourceCharacterArchetypeId === slotSourceId(slot) &&
        option.skill.key === slotSkillKey(slot)
    ) ?? null

  function pick(option: SlotOption | null) {
    if (!option) return
    const next =
      option.kind === "empty"
        ? { sourceCharacterArchetypeId: null, skillKey: null }
        : {
            sourceCharacterArchetypeId: option.sourceCharacterArchetypeId,
            skillKey: option.skill.key,
          }
    if (
      next.sourceCharacterArchetypeId === slotSourceId(slot) &&
      next.skillKey === slotSkillKey(slot)
    ) {
      return
    }
    write({
      edit: {
        kind: "setInheritanceSlot",
        characterArchetypeId: ownerEntry.row.id,
        slotIndex,
        ...next,
      },
      surface: "inheritanceSlots",
      action: (expectedVersion) =>
        setInheritanceSlotAction({
          characterId,
          characterArchetypeId: ownerEntry.row.id,
          slotIndex,
          ...next,
          expectedVersion,
        }),
      messages: {
        stale: "Couldn't sync — refresh to see the latest.",
        error: "Couldn't update the Inheritance Slot. Try again.",
      },
    })
  }

  const nothingToInherit = sourceGroups.length === 0 && slot?.resolved == null
  if (nothingToInherit) {
    return (
      <span className="text-xs text-muted-foreground italic">
        Nothing to inherit
      </span>
    )
  }

  return (
    <Combobox<SlotOption>
      items={groups}
      value={current}
      onValueChange={pick}
      itemToStringLabel={(option) =>
        option.kind === "empty" ? "Empty slot" : option.skill.name
      }
      itemToStringValue={optionValue}
      isItemEqualToValue={(a, b) => optionValue(a) === optionValue(b)}
      disabled={pending}
      autoHighlight
    >
      <ComboboxTrigger
        aria-label={`Edit Inheritance Slot ${slotIndex + 1}`}
        className="inline-flex items-center gap-0.5 rounded-sm text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        Edit
      </ComboboxTrigger>
      <ComboboxContent className="min-w-72">
        <ComboboxInput placeholder="Search Skills…" showTrigger={false} />
        <ComboboxEmpty>No Skills available to inherit.</ComboboxEmpty>
        <ComboboxList>
          {(group: PickerGroup) => (
            <ComboboxGroup key={group.id} items={group.items}>
              <ComboboxLabel className="font-semibold tracking-wide uppercase">
                {group.label}
              </ComboboxLabel>
              <ComboboxCollection>
                {(option: SlotOption) => (
                  <ComboboxItem key={optionValue(option)} value={option}>
                    {option.kind === "empty" ? (
                      <span className="text-muted-foreground italic">
                        Empty slot
                      </span>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{option.skill.name}</span>
                        <SkillCostBadge cost={option.skill.resolvedCost} />
                      </div>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function slotSourceId(slot: ResolvedInheritanceSlot | null): string | null {
  return slot?.sourceCharacterArchetypeId ?? null
}

function slotSkillKey(slot: ResolvedInheritanceSlot | null): string | null {
  return slot?.skillKey ?? null
}
