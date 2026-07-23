"use client"

import { useEffect, useState } from "react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { useViewerRole } from "@/components/shell/viewer-role"
import { characterEntityWrite, CharacterRoot } from "@/domain/character/client"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"

import { SHEET_TABS, type SheetTabKey } from "./tab-dock"

/**
 * The sheet's ⌘K palette, re-bound to the entity door (S2a; ADR §2.10 — "its
 * vitals batch becomes descriptor dispatches"). Two batches: navigation (the
 * shipped tabs) and, for the owner, the vitals quick-writes — each item one
 * descriptor through the provider's dispatch, the same rail the buttons ride.
 * The progression batch returns with the S2b virtues surface.
 */
export function SheetCommandPalette({
  onNavigate,
}: {
  onNavigate: (tab: SheetTabKey) => void
}) {
  const role = useViewerRole()
  const root = CharacterRoot.useRoot()
  const { resolved } = root.value
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const run = (action: () => void) => {
    action()
    setOpen(false)
  }

  const write = (descriptor: EntityWrite) =>
    run(() =>
      root.mutate(
        characterEntityWrite({
          entityId: root.value.profile.id,
          write: descriptor,
        })
      )
    )

  const vitals: Array<{ label: string; descriptor: EntityWrite }> = []
  if (role === "owner") {
    if (resolved.components.vitals) {
      for (const amount of [1, 5]) {
        vitals.push(
          {
            label: `Take ${amount} damage`,
            descriptor: { component: "vitals", op: "damage", amount },
          },
          {
            label: `Heal ${amount} HP`,
            descriptor: { component: "vitals", op: "heal", amount },
          }
        )
      }
    }
    if (resolved.components.skillPool) {
      for (const amount of [1, 5]) {
        vitals.push(
          {
            label: `Spend ${amount} SP`,
            descriptor: { component: "skillPool", op: "damage", amount },
          },
          {
            label: `Recover ${amount} SP`,
            descriptor: { component: "skillPool", op: "heal", amount },
          }
        )
      }
    }
    if ((resolved.components.resources?.currentPrisma ?? 0) > 0) {
      vitals.push({
        label: "Use a Prisma charge",
        descriptor: { component: "resources", op: "usePrisma" },
      })
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a section or adjust vitals"
    >
      <Command>
        <CommandInput placeholder="Type a command…" />
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>
          <CommandGroup heading="Go to">
            {SHEET_TABS.map(({ key, label }) => (
              <CommandItem
                key={key}
                onSelect={() => run(() => onNavigate(key))}
              >
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
          {vitals.length > 0 ? (
            <CommandGroup heading="Vitals">
              {vitals.map((command) => (
                <CommandItem
                  key={command.label}
                  onSelect={() => write(command.descriptor)}
                >
                  {command.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
