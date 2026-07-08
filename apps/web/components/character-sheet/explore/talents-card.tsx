"use client"

import { LockIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import { useState } from "react"

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite, useLoadedCharacter } from "@/hooks/use-entity-write"
import { resolveTalentsForSheet } from "@/lib/game-engine-v2"

import { SheetCard } from "../sheet-card"

/**
 * The Talents card (design frame `10b`; rulebook 2.1): the full roster as
 * chips — active-Archetype grants locked and muted, owned Talents bright with
 * an owner-only remove — plus the owner's **Add Talent** popover over the
 * remaining canonical list (the downtime-learning surface, so no creation
 * cap; per-entry `talents.add`/`remove` descriptors, never a whole-list
 * compose).
 */
export function TalentsCard() {
  const role = useViewerRole()
  const { resolved } = useLoadedCharacter()
  const { dispatch } = useEntityWrite()
  const [addOpen, setAddOpen] = useState(false)

  const { chips, remaining } = resolveTalentsForSheet(resolved)

  const add = (key: string) => {
    setAddOpen(false)
    dispatch(
      { component: "talents", op: "add", key },
      { messages: { error: "Couldn't add the Talent. Try again." } }
    )
  }

  const remove = (key: string) =>
    dispatch(
      { component: "talents", op: "remove", key },
      { messages: { error: "Couldn't remove the Talent. Try again." } }
    )

  return (
    <SheetCard
      title="Talents"
      headerSlot={
        <OwnerOnly>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <PlusIcon aria-hidden />
              Add Talent
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <Command>
                <CommandInput placeholder="Search Talents…" />
                <CommandList>
                  <CommandEmpty>No Talent found.</CommandEmpty>
                  <CommandGroup>
                    {remaining.map(({ key, label }) => (
                      <CommandItem key={key} onSelect={() => add(key)}>
                        {label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </OwnerOnly>
      }
    >
      {chips.length > 0 ? (
        <div className="flex flex-wrap content-start gap-2">
          {chips.map((chip) => (
            <Badge
              // An owned Talent the active Archetype also grants renders twice
              // (locked + removable), so the key carries the source.
              key={`${chip.inherited ? "inherited" : "owned"}-${chip.key}`}
              variant={chip.inherited ? "secondary" : "outline"}
              className={
                chip.inherited
                  ? "gap-1 py-1 pr-2.5 pl-2 text-muted-foreground"
                  : "gap-1 py-1 pr-1.5 pl-2.5 text-sm"
              }
            >
              {chip.inherited ? (
                <LockIcon weight="bold" className="size-3 opacity-70" />
              ) : null}
              {chip.label}
              {!chip.inherited && role === "owner" ? (
                <button
                  type="button"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => remove(chip.key)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No Talents yet.
        </p>
      )}
    </SheetCard>
  )
}
