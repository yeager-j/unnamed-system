"use client"

import { CaretDownIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { LINEAGE_DISPLAY } from "@/domain/labels"
import { LINEAGES, type Lineage } from "@/domain/vocab"
import { setNpcLineageAction } from "@/lib/actions/campaign-world/npc-traits"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * The **Lineage picker** (UNN-579, D8 — the hard-unique Atlas-gate lane):
 * every Lineage has at most one gate-holder per campaign, so taken rows are
 * **disabled** with the holder shown, and the write's `"lineage-taken"`
 * covers the race the disabled row can't.
 */
export function LineagePicker({
  campaignId,
  entityId,
  value,
  holders,
}: {
  campaignId: string
  entityId: string
  value: Lineage | null
  /** Lineage → holder name over the live NPCs (this NPC excluded by the page). */
  holders: ReadonlyMap<Lineage, string>
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  const set = (lineageKey: Lineage | null) =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setNpcLineageAction({
            campaignId,
            entityId,
            lineageKey,
          })
          if (!result.ok) {
            toast.error(
              result.error === "lineage-taken"
                ? "That Lineage is already held — clear it there first."
                : "Couldn't set the Lineage. Try again."
            )
            return
          }
          setOpen(false)
        },
        () => toast.error("Couldn't set the Lineage. Try again.")
      )
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {value === null ? "Set Lineage" : LINEAGE_DISPLAY[value].label}
        <CaretDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search Lineages…" autoFocus />
          <CommandList>
            <CommandEmpty>No Lineage matches.</CommandEmpty>
            <CommandGroup>
              {LINEAGES.map((lineage) => {
                const holder = holders.get(lineage)
                const taken = holder !== undefined
                return (
                  <CommandItem
                    key={lineage}
                    value={LINEAGE_DISPLAY[lineage].label}
                    disabled={taken}
                    onSelect={() => set(lineage)}
                  >
                    <span className="flex-1 truncate">
                      {LINEAGE_DISPLAY[lineage].label}
                    </span>
                    {taken ? (
                      <span className="text-xs text-muted-foreground">
                        held by {holder}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
              {value !== null ? (
                <CommandItem value="__clear" onSelect={() => set(null)}>
                  <XIcon className="size-4" />
                  Return to the deck
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
