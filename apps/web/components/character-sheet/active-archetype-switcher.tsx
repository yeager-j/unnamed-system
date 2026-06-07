"use client"

import { InfoIcon } from "@phosphor-icons/react"

import { archetypeDisplayName } from "@workspace/game/data"
import { type ArchetypeSwitcherOption } from "@workspace/game/engine"
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

import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { setActiveArchetypeAction } from "@/lib/actions/active-archetype"
import { archetypeSwitcherGroups } from "@/lib/game-engine"
import { LINEAGE_LABELS, TIER_LABELS } from "@/lib/ui/labels"

interface SwitcherGroup {
  lineage: keyof typeof LINEAGE_LABELS
  items: ArchetypeSwitcherOption[]
}

/**
 * Owner-mode "Switch Active Archetype" control (PRD §6.1, UNN-238). Replaces
 * the static Archetype name in the sheet header's identity line with a
 * searchable, Lineage-grouped Combobox — the active Archetype drives Attributes,
 * Affinities, the Combat-tab Skills list, and the Mechanic widget, so switching
 * it from the persistent header reaches every tab without navigating.
 *
 * High-level characters can carry a dozen-plus unlocked Archetypes, so the
 * picker is a Combobox (typeahead search + per-Lineage groups), not a flat
 * menu. It is controlled by the optimistic `activeArchetypeId`: the current
 * Archetype is the selected value (checkmarked), and selecting a different one
 * dispatches the switch through {@link useCharacterWrite} — the whole sheet
 * re-derives in the optimistic frame and the server revalidates.
 *
 * When the character has fewer than two unlocked Archetypes there is nothing to
 * switch to, so it renders the same plain name a non-owner sees. Switching is
 * allowed anytime; the popup carries the (non-enforced) "only during a Respite"
 * reminder per the rulebook.
 */
export function ActiveArchetypeSwitcher() {
  const character = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  const groups: SwitcherGroup[] = archetypeSwitcherGroups(character).map(
    (group) => ({ lineage: group.lineage, items: group.options })
  )
  const options = groups.flatMap((group) => group.items)

  if (options.length < 2) {
    return <>{archetypeDisplayName(character.activeArchetypeKey)}</>
  }

  const active =
    options.find((option) => option.id === character.activeArchetypeId) ?? null

  function switchTo(option: ArchetypeSwitcherOption | null) {
    if (!option || option.id === character.activeArchetypeId) return
    write({
      edit: { kind: "switchActiveArchetype", characterArchetypeId: option.id },
      surface: "activeArchetype",
      action: (expectedVersion) =>
        setActiveArchetypeAction({
          characterId,
          characterArchetypeId: option.id,
          expectedVersion,
        }),
      messages: {
        stale: "Couldn't sync — refresh to see the latest.",
        error: "Couldn't switch Archetype. Try again.",
      },
    })
  }

  return (
    <Combobox<ArchetypeSwitcherOption>
      items={groups}
      value={active}
      onValueChange={switchTo}
      itemToStringLabel={(option) => option.name}
      itemToStringValue={(option) => option.id}
      isItemEqualToValue={(a, b) => a.id === b.id}
      disabled={pending}
      autoHighlight
    >
      <ComboboxTrigger
        aria-label="Switch active Archetype"
        className="inline-flex items-center gap-0.5 rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        {archetypeDisplayName(character.activeArchetypeKey)}
      </ComboboxTrigger>
      <ComboboxContent className="min-w-72">
        <ComboboxInput placeholder="Search Archetypes…" showTrigger={false} />
        <p className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
          <InfoIcon className="size-3.5 shrink-0" />
          You may only switch Archetypes during a Respite.
        </p>
        <ComboboxEmpty>No Archetype found.</ComboboxEmpty>
        <ComboboxList>
          {(group: SwitcherGroup) => (
            <ComboboxGroup key={group.lineage} items={group.items}>
              <ComboboxLabel className="font-semibold tracking-wide uppercase">
                {LINEAGE_LABELS[group.lineage]}
              </ComboboxLabel>
              <ComboboxCollection>
                {(option: ArchetypeSwitcherOption) => (
                  <ComboboxItem key={option.id} value={option}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{option.name}</span>
                      <span className="text-muted-foreground">
                        {TIER_LABELS[option.tier]} · Rank {option.rank}/5
                        {option.mechanicName ? ` · ${option.mechanicName}` : ""}
                      </span>
                    </div>
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
