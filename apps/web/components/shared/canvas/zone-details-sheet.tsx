"use client"

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, type ReactNode } from "react"

import {
  MAP_ZONE_MOTIFS,
  type MapZone,
  type MapZoneMood,
  type MapZoneMotif,
  type MapZoneSize,
} from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"
import { cn } from "@workspace/ui/lib/utils"

import {
  ZONE_MOOD_LABELS,
  ZONE_MOTIF_LABELS,
  ZONE_SIZE_LABELS,
} from "@/domain/labels"

import type { ZoneIdentityPatch } from "./map-canvas-context"

const SIZES: MapZoneSize[] = ["S", "M", "L", "XL"]
const MOODS: MapZoneMood[] = ["warm", "dim", "cool"]

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
  onSetIdentity,
}: {
  zone: MapZone | null
  onClose: () => void
  onRename: (zoneId: string, name: string) => void
  onSetText: (
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) => void
  onSetIdentity: (zoneId: string, identity: ZoneIdentityPatch) => void
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
            onSetIdentity={onSetIdentity}
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
  onSetIdentity,
}: {
  zone: MapZone
  onRename: (zoneId: string, name: string) => void
  onSetText: (
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) => void
  onSetIdentity: (zoneId: string, identity: ZoneIdentityPatch) => void
}) {
  const [name, setName] = useState(zone.name)
  const [description, setDescription] = useState(zone.description)
  const [dmNotes, setDmNotes] = useState(zone.dmNotes)
  const [size, setSize] = useState<MapZoneSize | undefined>(zone.size)
  const [motif, setMotif] = useState(zone.motif)
  const [motifOpen, setMotifOpen] = useState(false)
  const [mood, setMood] = useState<MapZoneMood | undefined>(zone.mood)

  function pickMotif(next: MapZoneMotif | undefined) {
    setMotif(next)
    setMotifOpen(false)
    onSetIdentity(zone.id, { motif: next ?? null })
  }

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

      <div className="flex flex-col gap-1.5">
        <Label>Size</Label>
        <ToggleGroup
          aria-label="Zone size"
          variant="outline"
          size="sm"
          spacing={0}
          value={size ? [size] : []}
          onValueChange={(value) => {
            const next = value[0] as MapZoneSize | undefined
            if (!next) return
            setSize(next)
            onSetIdentity(zone.id, { size: next })
          }}
        >
          {SIZES.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={ZONE_SIZE_LABELS[option]}
            >
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Motif</Label>
        <Popover open={motifOpen} onOpenChange={setMotifOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-between font-normal"
              />
            }
          >
            <span
              className={cn(motif === undefined && "text-muted-foreground")}
            >
              {motif ? ZONE_MOTIF_LABELS[motif] : "None"}
            </span>
            <CaretDownIcon className="text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <div className="grid grid-cols-3 gap-1.5">
              <MotifButton
                selected={motif === undefined}
                onClick={() => pickMotif(undefined)}
              >
                None
              </MotifButton>
              {MAP_ZONE_MOTIFS.map((option) => (
                <MotifButton
                  key={option}
                  selected={motif === option}
                  onClick={() => pickMotif(option)}
                >
                  {ZONE_MOTIF_LABELS[option]}
                </MotifButton>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Mood</Label>
        <ToggleGroup
          aria-label="Zone mood"
          variant="outline"
          size="sm"
          spacing={0}
          value={mood ? [mood] : []}
          onValueChange={(value) => {
            const next = value[0] as MapZoneMood | undefined
            if (!next) return
            setMood(next)
            onSetIdentity(zone.id, { mood: next })
          }}
        >
          {MOODS.map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {ZONE_MOOD_LABELS[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

/** One cell in the motif glyph grid — a labeled toggle; the vendored glyphs land in P1b. */
function MotifButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "secondary" : "outline"}
      aria-pressed={selected}
      className={cn("justify-center", selected && "ring-1 ring-ring")}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
