"use client"

import { UserPlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { DataSelect } from "@workspace/ui/components/data-select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import type { PageZoneGroup } from "@/domain/map/view/page-groups"

/**
 * The Play-phase "Add to delve" affordance (UNN-487): the DM brings a campaign
 * character who wasn't placed at delve start into the running delve. It lists the
 * campaign's finalized-placed characters **absent** from the Instance occupancy —
 * the caller derives that diff, so an empty list is the everyone's-already-in
 * state — and drops each into a chosen Zone via `onPlace`, which dispatches the
 * `placeCombatant` spatial event (mirroring the draft-prep zone `Select`).
 *
 * Placement is immediate per row (the delve is live, unlike prep's batch commit):
 * a placed character leaves the caller's occupancy-derived list on the next render,
 * so the row simply disappears — no local placement state to track. The zone
 * `Select` therefore stays value-less; picking a Zone *is* the action.
 */
export function AddToDelveDialog({
  absentCharacters,
  zoneGroups,
  disabled,
  onPlace,
}: {
  absentCharacters: { id: string; name: string }[]
  /** Zones grouped by page (UNN-586) — headings render only for a >1-page map. */
  zoneGroups: PageZoneGroup[]
  disabled?: boolean
  onPlace: (characterId: string, zoneId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <SidebarMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <SidebarMenuButton disabled={disabled} tooltip="Add to delve">
              <UserPlusIcon />
              <span className="group-data-[collapsible=icon]:hidden">
                Add to delve
              </span>
            </SidebarMenuButton>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to delve</DialogTitle>
            <DialogDescription>
              Drop a campaign character into a Zone to bring them into the
              delve.
            </DialogDescription>
          </DialogHeader>

          {absentCharacters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone in the campaign is already in this delve.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {absentCharacters.map((character) => (
                <li
                  key={character.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {character.name}
                  </span>
                  <Label className="sr-only" htmlFor={`place-${character.id}`}>
                    Zone for {character.name}
                  </Label>
                  <DataSelect
                    size="sm"
                    id={`place-${character.id}`}
                    className="w-48"
                    placeholder="Choose a zone"
                    disabled={disabled}
                    options={zoneGroups.flatMap((group) =>
                      group.zones.map((zone) => ({
                        zone,
                        pageId: group.pageId,
                        pageName: group.pageName,
                      }))
                    )}
                    optionValue={({ zone }) => zone.id}
                    optionLabel={({ zone }) => zone.name}
                    optionGroup={({ pageId, pageName }) => ({
                      key: pageId,
                      label: pageName,
                    })}
                    value=""
                    onValueChange={(zoneId) => {
                      if (zoneId) onPlace(character.id, zoneId)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  )
}
