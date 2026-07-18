"use client"

import { LockIcon } from "@phosphor-icons/react"
import { Fragment } from "react"
import { toast } from "sonner"

import {
  MAX_PLAYER_ADDED_TALENTS,
  type TalentKey,
} from "@workspace/game-v2/talents/vocab"
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

import {
  useEntityWrite,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { resolveOriginTalentChoices } from "@/domain/game-engine-v2"
import { talentLabel } from "@/domain/labels"

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
 * A change dispatches ONE whole-list `talents.setGained` descriptor (identity
 * class) — the descriptor is structurally a per-field write, so there is no
 * add/remove action pair to race. The picker's value is the stored list
 * filtered against the current Origin's grants (the Writer deliberately does
 * not prune on an Origin switch — CH15 class disjointness — so this display
 * filter is what keeps a stale grant from showing as a player pick; finalize
 * prunes the stored list for real).
 */
export function TalentsPicker() {
  const { entity } = useLoadedCharacter()
  const { pending, dispatch } = useEntityWrite()
  const anchor = useComboboxAnchor()

  const originArchetypeKey = entity.components.archetypes?.origin ?? null
  const { granted, selectable } = resolveOriginTalentChoices(originArchetypeKey)
  const originGranted = new Set(granted)
  // Stored keys are open strings in v2; the picker treats them as canonical
  // keys for display (an unknown key simply never matches the canonical list).
  const gainedTalents = (entity.components.talents ?? [])
    .map(({ key }) => key)
    .filter((key) => !originGranted.has(key)) as TalentKey[]
  const atCap = gainedTalents.length >= MAX_PLAYER_ADDED_TALENTS

  function handleChange(next: TalentKey[]) {
    const added = next.some((k) => !gainedTalents.includes(k))
    if (added && atCap) {
      toast.error(`You can pick at most ${MAX_PLAYER_ADDED_TALENTS} Talents.`)
      return
    }
    dispatch(
      { component: "talents", op: "setGained", keys: next },
      {
        messages: {
          error: "Couldn't save Talents. Try again.",
        },
      }
    )
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
        {granted.length > 0 ? (
          <div className="flex flex-col gap-2">
            <FieldLabel>From your Origin Archetype</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {granted.map((key) => (
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
