"use client"

import { CheckIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { archetypeDisplayName } from "@workspace/game-v2/catalog/archetypes"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import {
  CHARACTER_PLACEMENT_CONSENT,
  CHARACTER_PLACEMENT_LIVE_LOCK_ERROR,
  characterMoveConsent,
} from "@/domain/labels"
import { setEntityCampaignAction } from "@/lib/actions/entity/set-campaign"
import type { OwnedPlacementCharacter } from "@/lib/db/queries/character-list"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "Add character to campaign" on the placement section (UNN-328). An inline
 * searchable list (cmdk `Command`, not a floating combobox — a popup anchored
 * inside a Dialog mis-positions) of the owner's finalized characters **not**
 * already in this campaign: unplaced ones, plus ones placed elsewhere (labeled
 * with their current campaign). The dialog states the consent, and when the
 * chosen character is placed elsewhere it doubles as the move confirmation
 * (single-campaign invariant): adding it here moves it. One
 * `setCharacterCampaignAction` handles both place and move atomically; a
 * `live-encounter-lock` (moving a live combatant) surfaces as a toast.
 */
export function AddCharacterDialog({
  campaignId,
  campaignName,
  available,
}: {
  campaignId: string
  campaignName: string
  available: OwnedPlacementCharacter[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<OwnedPlacementCharacter | null>(null)
  const [isPending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSelected(null)
  }

  function onAdd() {
    if (!selected) return
    const character = selected
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setEntityCampaignAction({
            entityId: character.id,
            campaignId,
          })
          if (result.ok) {
            onOpenChange(false)
            toast.success(`${character.name} added to ${campaignName}.`)
            return
          }
          if (result.error === "live-encounter-lock") {
            toast.error(CHARACTER_PLACEMENT_LIVE_LOCK_ERROR)
            return
          }
          toast.error("Couldn't add the character. Try again.")
        },
        () => toast.error("Couldn't add the character. Try again.")
      )
    )
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        Add character
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a character to {campaignName}</DialogTitle>
            <DialogDescription>{CHARACTER_PLACEMENT_CONSENT}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Command className="rounded-md border">
              <CommandInput placeholder="Search your characters…" />
              <CommandList>
                <CommandEmpty>No characters found.</CommandEmpty>
                {available.map((character) => {
                  const isSelected = selected?.id === character.id
                  return (
                    <CommandItem
                      key={character.id}
                      value={`${character.name} ${character.placedCampaignName ?? ""} ${character.id}`}
                      onSelect={() => setSelected(character)}
                      aria-selected={isSelected}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">
                          {character.name}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {character.placedCampaignName
                            ? `In ${character.placedCampaignName}`
                            : `Level ${character.level} · ${archetypeDisplayName(character.activeArchetypeKey)}`}
                        </span>
                      </div>
                      <CommandShortcut>
                        {isSelected ? (
                          <span className="sr-only">Selected</span>
                        ) : null}
                        <CheckIcon
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>

            {selected?.placedCampaignName ? (
              <p className="text-sm text-muted-foreground">
                {characterMoveConsent(selected.placedCampaignName)}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={onAdd}
              disabled={!selected || isPending}
            >
              {isPending ? <Spinner /> : null}
              {selected?.placedCampaignName ? "Move here" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
