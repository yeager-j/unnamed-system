"use client"

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import {
  deriveDungeonRoster,
  isZoneRevealed,
  resolveZoneExits,
} from "@workspace/game/engine"
import type { MapInstanceState, MapZone } from "@workspace/game/foundation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"

import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { ExitRow } from "@/components/dungeon/explore/exit-row"

type PendingConfirm =
  | { kind: "reveal-zone" }
  | { kind: "reveal-connection"; connectionId: string; label: string }
  | { kind: "unlock-connection"; connectionId: string; label: string }

/**
 * The Zone details surface for the run console (UNN-464) — a right-side
 * {@link ResponsiveDialog} (Sheet on desktop, Drawer on mobile) opened by clicking
 * a Zone on the canvas. It is the DM's reveal hub: the Zone's player-facing
 * description + private DM notes, its current player visibility, and a list of
 * **exits** (the connections out of it) each with its own reveal/hide/unlock
 * control. Reveal + unlock are player-visible and socially irreversible, so they
 * confirm (PRD FR-5); revealing an exit can optionally be attributed to a
 * searching character (the atomic search-that-reveals, AC3). Hide / re-lock are
 * immediate DM corrections.
 */
export function DungeonZoneSheet({
  zone,
  instance,
  roster,
  onClose,
  onRevealZone,
  onHideZone,
  onRevealConnection,
  onSearchReveal,
  onHideConnection,
  onUnlockConnection,
  onLockConnection,
  disabled,
}: {
  zone: MapZone | null
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onClose: () => void
  onRevealZone: (zoneId: string) => void
  onHideZone: (zoneId: string) => void
  onRevealConnection: (connectionId: string) => void
  onSearchReveal: (characterId: string, connectionId: string) => void
  onHideConnection: (connectionId: string) => void
  onUnlockConnection: (connectionId: string) => void
  onLockConnection: (connectionId: string) => void
  disabled?: boolean
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
          <ResponsiveDialogTitle>
            {present?.name ?? "Zone"}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            What players see on reveal, your private notes, and the exits out of
            here.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {present && (
          <ZoneSheetBody
            key={present.id}
            zone={present}
            instance={instance}
            roster={roster}
            onRevealZone={onRevealZone}
            onHideZone={onHideZone}
            onRevealConnection={onRevealConnection}
            onSearchReveal={onSearchReveal}
            onHideConnection={onHideConnection}
            onUnlockConnection={onUnlockConnection}
            onLockConnection={onLockConnection}
            disabled={disabled}
          />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function ZoneSheetBody({
  zone,
  instance,
  roster,
  onRevealZone,
  onHideZone,
  onRevealConnection,
  onSearchReveal,
  onHideConnection,
  onUnlockConnection,
  onLockConnection,
  disabled,
}: {
  zone: MapZone
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onRevealZone: (zoneId: string) => void
  onHideZone: (zoneId: string) => void
  onRevealConnection: (connectionId: string) => void
  onSearchReveal: (characterId: string, connectionId: string) => void
  onHideConnection: (connectionId: string) => void
  onUnlockConnection: (connectionId: string) => void
  onLockConnection: (connectionId: string) => void
  disabled?: boolean
}) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [searcherId, setSearcherId] = useState<string>("")

  const revealed = isZoneRevealed(instance.reveal, zone.id)
  const rosterIds = deriveDungeonRoster(instance)

  const exits = resolveZoneExits(instance, zone.id)

  function confirm() {
    if (pending?.kind === "reveal-zone") {
      onRevealZone(zone.id)
    } else if (pending?.kind === "reveal-connection") {
      if (searcherId) onSearchReveal(searcherId, pending.connectionId)
      else onRevealConnection(pending.connectionId)
    } else if (pending?.kind === "unlock-connection") {
      onUnlockConnection(pending.connectionId)
    }
    setPending(null)
    setSearcherId("")
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={revealed ? "secondary" : "outline"}>
          {revealed ? (
            <>
              <EyeIcon /> Revealed to players
            </>
          ) : (
            <>
              <EyeSlashIcon /> Hidden from players
            </>
          )}
        </Badge>
        {revealed ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onHideZone(zone.id)}
          >
            <EyeSlashIcon /> Hide
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setPending({ kind: "reveal-zone" })}
          >
            <EyeIcon /> Reveal
          </Button>
        )}
      </div>

      <Field label="Player description">
        {zone.description ? (
          <p className="text-sm whitespace-pre-wrap">{zone.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description yet.
          </p>
        )}
      </Field>

      <Field label="DM notes">
        {zone.dmNotes ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {zone.dmNotes}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No DM notes yet.
          </p>
        )}
      </Field>

      <Field label={`Exits (${exits.length})`}>
        {exits.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            This zone is a dead end.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exits.map((exit) => (
              <ExitRow
                key={exit.connection.id}
                exit={exit}
                disabled={disabled}
                onReveal={() =>
                  setPending({
                    kind: "reveal-connection",
                    connectionId: exit.connection.id,
                    label: `${zone.name} ↔ ${exit.neighborName}`,
                  })
                }
                onHide={() => onHideConnection(exit.connection.id)}
                onUnlock={() =>
                  setPending({
                    kind: "unlock-connection",
                    connectionId: exit.connection.id,
                    label: `${zone.name} ↔ ${exit.neighborName}`,
                  })
                }
                onRelock={() => onLockConnection(exit.connection.id)}
              />
            ))}
          </ul>
        )}
      </Field>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setSearcherId("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "reveal-zone"
                ? "Reveal this zone to players?"
                : pending?.kind === "reveal-connection"
                  ? "Reveal this passage to players?"
                  : "Unlock this passage?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "reveal-zone"
                ? "Players will see this zone on their map."
                : `${pending?.kind === "reveal-connection" || pending?.kind === "unlock-connection" ? pending.label : ""}.`}{" "}
              This is visible to players and can&apos;t be quietly undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pending?.kind === "reveal-connection" && rosterIds.length > 0 && (
            <Label className="flex flex-col gap-1.5 text-sm">
              Searched by (optional)
              <Select
                value={searcherId}
                onValueChange={(value) => setSearcherId(value ?? "")}
                disabled={disabled}
              >
                <SelectTrigger size="sm" aria-label="Searched by">
                  <SelectValue placeholder="No one — just reveal" />
                </SelectTrigger>
                <SelectContent>
                  {rosterIds.map((characterId) => (
                    <SelectItem key={characterId} value={characterId}>
                      {roster[characterId]?.name ?? "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              {pending?.kind === "unlock-connection" ? "Unlock" : "Reveal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {children}
    </div>
  )
}
