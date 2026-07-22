"use client"

import {
  CaretDownIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { ARCANA } from "@/domain/planner/arcana"
import { setNpcArcanaAction } from "@/lib/actions/campaign-world/npc-traits"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"

/**
 * The **Arcana picker** (UNN-579, D8 — advisory only): all 22 Major Arcana.
 * A card already held elsewhere warns "held by ⟨name⟩" but stays selectable;
 * the three the Toolkit reserves (Fool / Judgement / World) carry a warning
 * icon whose tooltip explains why they rarely suit an NPC — chosen anyway if
 * the DM insists (Jackson's call).
 */
export function ArcanaPicker({
  campaignId,
  entityId,
  value,
  holders,
}: {
  campaignId: string
  entityId: string
  value: string | null
  /** Arcana label → holder name over the live NPCs (this NPC excluded by the page). */
  holders: ReadonlyMap<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  const set = (arcana: string | null) =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await setNpcArcanaAction({
            campaignId,
            entityId,
            arcana,
          })
          if (!result.ok) {
            toast.error("Couldn't set the Arcana. Try again.")
            return
          }
          setOpen(false)
        },
        () => toast.error("Couldn't set the Arcana. Try again.")
      )
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {value ?? "Set Arcana"}
        <CaretDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search the Major Arcana…" autoFocus />
          <CommandList>
            <CommandEmpty>No card matches.</CommandEmpty>
            <CommandGroup>
              {ARCANA.map((card) => {
                const holder = holders.get(card.label)
                return (
                  <CommandItem
                    key={card.label}
                    value={`${card.numeral} ${card.label}`}
                    onSelect={() => set(card.label)}
                  >
                    <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">
                      {card.numeral}
                    </span>
                    <span className="flex-1 truncate">{card.label}</span>
                    {holder !== undefined ? (
                      <span className="text-xs text-muted-foreground">
                        held by {holder}
                      </span>
                    ) : null}
                    {card.caution !== undefined ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              aria-label={`Caution: ${card.caution}`}
                              className="text-gold"
                            />
                          }
                        >
                          <WarningIcon className="size-4" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">
                          {card.caution}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </CommandItem>
                )
              })}
              {value !== null ? (
                <CommandItem value="__clear" onSelect={() => set(null)}>
                  <XIcon className="size-4" />
                  Clear Arcana
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
