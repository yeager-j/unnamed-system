"use client"

import {
  ArrowRightIcon,
  CheckIcon,
  FlagCheckeredIcon,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"
import { useState } from "react"

import {
  activeActedCharacterIds,
  deriveDungeonRoster,
} from "@workspace/game/engine"
import type { DungeonState, MapInstanceState } from "@workspace/game/foundation"
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
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { initials } from "@/lib/ui/initials"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"

/**
 * The DM run console's floating **bottom bar** (UNN-464 chrome pass) — the
 * exploration turn loop relocated from a left rail to a FigJam-style bar over the
 * canvas: the dungeon-turn counter + Advance, the party as "acted this turn" chips
 * (each chip's menu carries Mark acted + the per-token Move to — the keyboard-path
 * counterpart to dragging), and Finish delve. The turn counter is the only turn
 * signal players ever see (no turn queue in exploration — PRD FR-6). Turn reminders
 * and the LIVE status live in the top-left {@link import("./dungeon-status-panel").DungeonStatusPanel};
 * random-encounter settings are Edit-mode config, not surfaced in Play. Zone reveal
 * + connection fog/locks live in the Zone details sheet.
 */
export function TurnLoopBar({
  dungeonState,
  instanceState,
  roster,
  onAdvanceTurn,
  onMarkActed,
  onMoveToken,
  onFinishDelve,
  disabled,
}: {
  dungeonState: DungeonState
  instanceState: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onAdvanceTurn: () => void
  onMarkActed: (characterId: string) => void
  onMoveToken: (characterId: string, toZoneId: string) => void
  onFinishDelve: () => void
  disabled?: boolean
}) {
  const rosterIds = deriveDungeonRoster(instanceState)
  const acted = new Set(activeActedCharacterIds(dungeonState, rosterIds))
  const [confirmFinish, setConfirmFinish] = useState(false)
  const zones = Object.values(instanceState.geometry.zones)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-3 border bg-popover p-2 shadow-lg">
        <div className="flex items-center gap-3 px-1">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Dungeon turn
            </span>
            <span className="font-heading text-2xl leading-none font-semibold tabular-nums">
              {dungeonState.turnCounter}
            </span>
          </div>
          <Button onClick={onAdvanceTurn} disabled={disabled}>
            Advance
            <ArrowRightIcon weight="bold" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-12" />

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Acted this turn
          </span>
          {rosterIds.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No tokens placed
            </span>
          ) : (
            <ul className="flex flex-wrap items-center gap-1.5">
              {rosterIds.map((characterId) => (
                <li key={characterId}>
                  <PartyChip
                    name={roster[characterId]?.name ?? "Unknown"}
                    portraitUrl={roster[characterId]?.portraitUrl ?? null}
                    zoneName={
                      instanceState.geometry.zones[
                        instanceState.occupancy[characterId]?.zoneId ?? ""
                      ]?.name ?? "—"
                    }
                    currentZoneId={
                      instanceState.occupancy[characterId]?.zoneId ?? ""
                    }
                    acted={acted.has(characterId)}
                    zones={zones}
                    disabled={disabled}
                    onMarkActed={() => onMarkActed(characterId)}
                    onMoveTo={(zoneId) => onMoveToken(characterId, zoneId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator orientation="vertical" className="h-12" />

        <Button
          variant="outline"
          onClick={() => setConfirmFinish(true)}
          disabled={disabled}
        >
          <FlagCheckeredIcon weight="bold" />
          Finish delve
        </Button>
      </div>

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish this delve?</AlertDialogTitle>
            <AlertDialogDescription>
              The delve will be marked done. Players see a frozen final map.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onFinishDelve()
                setConfirmFinish(false)
              }}
            >
              Finish delve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * One party member in the bar — a side-tinted chip (avatar + name + current Zone)
 * whose menu carries the two per-token actions the old rail rows held: Mark acted
 * and Move to a Zone. Acted members dim and show a check.
 */
function PartyChip({
  name,
  portraitUrl,
  zoneName,
  currentZoneId,
  acted,
  zones,
  disabled,
  onMarkActed,
  onMoveTo,
}: {
  name: string
  portraitUrl: string | null
  zoneName: string
  currentZoneId: string
  acted: boolean
  zones: { id: string; name: string }[]
  disabled?: boolean
  onMarkActed: () => void
  onMoveTo: (zoneId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex max-w-[12rem] items-center gap-1.5 border border-blue-700 bg-blue-100 py-1 pr-2 pl-1 text-left",
              "dark:border-blue-400 dark:bg-blue-950",
              acted && "opacity-55"
            )}
          />
        }
      >
        {portraitUrl ? (
          <Image
            src={portraitUrl}
            alt=""
            width={20}
            height={20}
            className="size-5 shrink-0 object-cover ring-1 ring-primary/40"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center bg-primary/10 text-[9px] font-semibold text-primary ring-1 ring-primary/40"
          >
            {initials(name, "?")}
          </span>
        )}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xs font-medium text-blue-950 dark:text-blue-100">
            {name}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {zoneName}
          </span>
        </span>
        {acted && (
          <CheckIcon className="size-3 shrink-0 text-blue-700 dark:text-blue-300" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={disabled || acted} onClick={onMarkActed}>
          <CheckIcon />
          {acted ? "Acted this turn" : "Mark acted"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {zones.map((zone) => (
            <DropdownMenuItem
              key={zone.id}
              disabled={disabled || zone.id === currentZoneId}
              onClick={() => onMoveTo(zone.id)}
            >
              {zone.id === currentZoneId ? (
                <CheckIcon />
              ) : (
                <span className="size-4" />
              )}
              {zone.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
