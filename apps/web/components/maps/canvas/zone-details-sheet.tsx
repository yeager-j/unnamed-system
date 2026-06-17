"use client"

import { useState } from "react"

import type { MapZone } from "@workspace/game/foundation"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { Textarea } from "@workspace/ui/components/textarea"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"

/**
 * The "Edit details" surface for a Zone (UNN-461) — a right-side {@link Sheet} on
 * desktop, a bottom {@link Drawer} on mobile (the rail + panel + canvas can't share
 * a tablet width; PRD *Responsive & wayfinding*). Edits dispatch as the DM types;
 * the Map editor's autosave debounces the geometry write. Driven by `zone` (open
 * when non-null); {@link useLastPresent} keeps the body mounted through the close
 * animation after the selection clears.
 */
export function ZoneDetailsSheet({
  zone,
  onClose,
  onRename,
  onSetText,
}: {
  zone: MapZone | null
  onClose: () => void
  onRename: (zoneId: string, name: string) => void
  onSetText: (
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) => void
}) {
  const present = useLastPresent(zone)

  return (
    <ResponsiveDialog
      open={zone !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ResponsiveDialogContent className="data-[side=right]:sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Zone details</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Name, the player-facing description shown on reveal, and private DM
            notes.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {present && (
          <ZoneDetailsForm
            key={present.id}
            zone={present}
            onRename={onRename}
            onSetText={onSetText}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function ZoneDetailsForm({
  zone,
  onRename,
  onSetText,
}: {
  zone: MapZone
  onRename: (zoneId: string, name: string) => void
  onSetText: (
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) => void
}) {
  const [name, setName] = useState(zone.name)
  const [description, setDescription] = useState(zone.description)
  const [dmNotes, setDmNotes] = useState(zone.dmNotes)

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zone-name">Name</Label>
        <Input
          id="zone-name"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value)
            onRename(zone.id, event.target.value)
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zone-description">Player description</Label>
        <Textarea
          id="zone-description"
          value={description}
          rows={4}
          placeholder="What players see when this zone is revealed…"
          onChange={(event) => {
            setDescription(event.target.value)
            onSetText(zone.id, { description: event.target.value })
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zone-dm-notes">DM notes</Label>
        <Textarea
          id="zone-dm-notes"
          value={dmNotes}
          rows={4}
          placeholder="Private notes only you can see…"
          onChange={(event) => {
            setDmNotes(event.target.value)
            onSetText(zone.id, { dmNotes: event.target.value })
          }}
        />
      </div>
    </div>
  )
}
