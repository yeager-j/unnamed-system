"use client"

import { LockIcon } from "@phosphor-icons/react"
import { Fragment } from "react"
import { toast } from "sonner"

import { resolveTalentsForBuilder } from "@workspace/game/engine"
import {
  MAX_PLAYER_ADDED_TALENTS,
  type TalentKey,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"

import { useBuilderDraft, useBuilderWrite } from "@/hooks/use-builder-draft"
import {
  addGainedTalentAction,
  removeGainedTalentAction,
} from "@/lib/actions/character-talents"
import { talentLabel } from "@/lib/ui/labels"

/**
 * Talents picker for Movement 2 — Ortus (rulebook 2.1, PRD §5.2). Allows
 * up to {@link MAX_PLAYER_ADDED_TALENTS} player-picked Talents at
 * creation alongside the active Archetype's automatic Talents.
 *
 * Two surfaces:
 *
 * 1. **Origin-derived chips** above — locked badges with a `LockIcon` so the
 *    "you can't remove these" affordance is explicit. Re-filters automatically
 *    if the player swaps Origin in another tab.
 * 2. **Player-added picks** — the canonical shadcn multi-select Combobox
 *    pattern: chosen Talents render as `ComboboxChip`s inside the chips
 *    container, the `ComboboxChipsInput` lets the player typeahead-search
 *    the remaining canonical list. Origin-derived Talents are excluded
 *    from the picker (already granted). Cap = {@link MAX_PLAYER_ADDED_TALENTS}.
 *
 * Writes flow through the identity-class retry pipeline. The diff is computed
 * from `value` vs. the prior selection so a Combobox change with multiple
 * deltas issues one add or one remove (the typical interaction is a single
 * toggle, but we don't assume it). Concurrent writes to `gainedTalents` are
 * the server's problem — `addGainedTalent` / `removeGainedTalent` are
 * read-modify-write inside a transaction with the identity-class bump.
 */
export function TalentsPicker() {
  const {
    id: characterId,
    originArchetypeKey,
    gainedTalents,
  } = useBuilderDraft()
  const { pending, write } = useBuilderWrite()
  const anchor = useComboboxAnchor()

  const { origin, selectable } = resolveTalentsForBuilder(originArchetypeKey)
  const atCap = gainedTalents.length >= MAX_PLAYER_ADDED_TALENTS

  function handleChange(next: TalentKey[]) {
    const added = next.find((k) => !gainedTalents.includes(k))
    const removed = gainedTalents.find((k) => !next.includes(k))

    if (added) {
      if (atCap) {
        toast.error(`You can pick at most ${MAX_PLAYER_ADDED_TALENTS} Talents.`)
        return
      }
      write({
        surface: "talents",
        action: (expectedVersion) =>
          addGainedTalentAction({
            characterId,
            talentKey: added,
            expectedVersion,
          }),
        messages: {
          stale:
            "Someone else updated this character — refresh to see the latest.",
          error: "Couldn't add Talent. Try again.",
        },
        // Duplicate is a benign cross-tab race; the next prop sync reflects it.
        onError: (error) => error === "duplicate-talent",
      })
      return
    }

    if (removed) {
      write({
        surface: "talents",
        action: (expectedVersion) =>
          removeGainedTalentAction({
            characterId,
            talentKey: removed,
            expectedVersion,
          }),
        messages: {
          stale: "Couldn't remove Talent. Try again.",
          error: "Couldn't remove Talent. Try again.",
        },
      })
    }
  }

  return (
    <FieldSet disabled={pending}>
      <FieldLegend>Talents</FieldLegend>
      <FieldDescription>
        Your active Archetype grants the Talents below automatically. You may
        also pick up to {MAX_PLAYER_ADDED_TALENTS} extra Talents from the
        canonical list — usually tied to your Background. More can be learned
        later through downtime.
      </FieldDescription>

      <div className="flex flex-col gap-4">
        {origin.length > 0 ? (
          <div className="flex flex-col gap-2">
            <FieldLabel>From your Origin Archetype</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {origin.map((key) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="gap-1 py-1 pr-2.5 pl-2"
                >
                  <LockIcon weight="bold" className="size-3 opacity-70" />
                  {talentLabel(key)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <FieldLabel>
            Background Talents ({gainedTalents.length}/
            {MAX_PLAYER_ADDED_TALENTS})
          </FieldLabel>
          <Combobox<TalentKey, true>
            multiple
            autoHighlight
            items={selectable}
            value={gainedTalents}
            onValueChange={(next) => handleChange(next as TalentKey[])}
            itemToStringLabel={(key) => talentLabel(key as TalentKey)}
          >
            <ComboboxChips ref={anchor}>
              <ComboboxValue>
                {(values: TalentKey[]) => (
                  <Fragment>
                    {values.map((key) => (
                      <ComboboxChip key={key}>{talentLabel(key)}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      placeholder={
                        atCap
                          ? "Remove a Talent to pick a different one"
                          : values.length === 0
                            ? "Add a Talent…"
                            : ""
                      }
                    />
                  </Fragment>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No matching Talents.</ComboboxEmpty>
              <ComboboxList>
                {(key: TalentKey) => (
                  <ComboboxItem key={key} value={key}>
                    {talentLabel(key)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
    </FieldSet>
  )
}
