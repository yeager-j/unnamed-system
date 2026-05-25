"use client"

import { LockIcon } from "@phosphor-icons/react"
import { Fragment, useTransition } from "react"
import { toast } from "sonner"

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
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  addGainedTalentAction,
  removeGainedTalentAction,
} from "@/lib/actions/character-talents"
import { MAX_PLAYER_ADDED_TALENTS } from "@/lib/db/character-talents"
import { getArchetype } from "@/lib/game/archetypes"
import { getTalent, TALENT_KEYS, type TalentKey } from "@/lib/game/talents"

/**
 * Talents picker for Step 3 (rulebook 2.1, PRD §5.2 — updated by UNN-207
 * to allow up to {@link MAX_PLAYER_ADDED_TALENTS} player-picked Talents at
 * creation alongside the active Archetype's automatic Talents).
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
export function TalentsPicker({
  characterId,
  identityVersion,
  originArchetypeKey,
  gainedTalents,
}: {
  characterId: string
  identityVersion: number
  originArchetypeKey: string | null
  gainedTalents: TalentKey[]
}) {
  const versionRef = useCharacterTokenRef(identityVersion)
  const [pending, startTransition] = useTransition()
  const anchor = useComboboxAnchor()

  const originTalents = originArchetypeKey
    ? (getArchetype(originArchetypeKey)?.talents ?? [])
    : []
  const originSet = new Set(originTalents)

  // Items selectable in the picker: every canonical Talent the player
  // hasn't been granted by their Origin. Already-picked ones stay in the
  // list so the indicator highlights them in the dropdown — the chip
  // remove button is the primary "remove" affordance, but selecting in
  // the list also toggles.
  const items = TALENT_KEYS.filter((key) => !originSet.has(key))
  const atCap = gainedTalents.length >= MAX_PLAYER_ADDED_TALENTS

  function handleChange(next: TalentKey[]) {
    const added = next.find((k) => !gainedTalents.includes(k))
    const removed = gainedTalents.find((k) => !next.includes(k))

    if (added) {
      if (atCap) {
        toast.error(`You can pick at most ${MAX_PLAYER_ADDED_TALENTS} Talents.`)
        return
      }
      startTransition(async () => {
        const result = await dispatchCharacterWriteWithRetry({
          characterId,
          characterClass: "identity",
          versionRef,
          action: (expectedVersion) =>
            addGainedTalentAction({
              characterId,
              talentKey: added,
              expectedVersion,
            }),
        })
        if (!result.ok) {
          if (result.error === "limit-exceeded") {
            toast.error(
              `You can pick at most ${MAX_PLAYER_ADDED_TALENTS} Talents.`
            )
          } else if (result.error === "duplicate-talent") {
            // Cross-tab race; the optimistic frame already reflects it.
          } else if (result.error === "stale") {
            toast.error(
              "Someone else updated this character — refresh to see the latest."
            )
          } else {
            toast.error("Couldn't add Talent. Try again.")
          }
        }
      })
      return
    }

    if (removed) {
      startTransition(async () => {
        const result = await dispatchCharacterWriteWithRetry({
          characterId,
          characterClass: "identity",
          versionRef,
          action: (expectedVersion) =>
            removeGainedTalentAction({
              characterId,
              talentKey: removed,
              expectedVersion,
            }),
        })
        if (!result.ok) {
          toast.error("Couldn't remove Talent. Try again.")
        }
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
        {originArchetypeKey && originTalents.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              From your Origin Archetype
            </h4>
            <div className="flex flex-wrap gap-2">
              {originTalents.map((key) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="gap-1 py-1 pr-2.5 pl-2"
                >
                  <LockIcon weight="bold" className="size-3 opacity-70" />
                  {getTalent(key)?.name ?? key}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Background Talents ({gainedTalents.length}/
            {MAX_PLAYER_ADDED_TALENTS})
          </h4>
          <Combobox<TalentKey, true>
            multiple
            autoHighlight
            items={items}
            value={gainedTalents}
            onValueChange={(next) => handleChange(next as TalentKey[])}
            itemToStringLabel={(key) =>
              getTalent(key as TalentKey)?.name ?? String(key)
            }
          >
            <ComboboxChips ref={anchor}>
              <ComboboxValue>
                {(values: TalentKey[]) => (
                  <Fragment>
                    {values.map((key) => (
                      <ComboboxChip key={key}>
                        {getTalent(key)?.name ?? key}
                      </ComboboxChip>
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
                    {getTalent(key)?.name ?? key}
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
