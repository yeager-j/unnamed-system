"use client"

import {
  ArrowRightIcon,
  FlagCheckeredIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  dungeonReminders,
} from "@workspace/game/engine"
import type {
  DungeonState,
  MapInstanceState,
  RandomEncounterInterval,
} from "@workspace/game/foundation"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import { RANDOM_ENCOUNTER_INTERVAL_LABELS } from "@/lib/ui/labels"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"

const REMINDER_COPY = {
  "random-encounter": {
    title: "Roll for a random encounter",
    body: "The party has travelled far enough — roll on your table.",
  },
  "exhaustion-onset": {
    title: "Exhaustion accrues",
    body: "Past the 48-turn day: a level of Exhaustion would accrue (tracked on the sheet).",
  },
} as const

/**
 * The DM run console's side rail (UNN-464) — the exploration turn loop and its
 * DM-only surfaces: the dungeon-turn counter + Advance, per-character acted-flags
 * (derived from the Instance tokens) with a "move to" select (the keyboard-path
 * counterpart to dragging tokens), the pure-selector reminders (dismissible,
 * component-local), the random-encounter reminder settings, and Finish delve. The
 * turn counter is the only turn signal the players ever see (no turn queue in
 * exploration — PRD FR-6). Zone reveal + connection fog/locks live in the Zone
 * details sheet, opened by clicking a Zone on the canvas.
 */
export function TurnLoopRail({
  dungeonState,
  instanceState,
  roster,
  onAdvanceTurn,
  onMarkActed,
  onMoveToken,
  onSetRandomEncountersEnabled,
  onSetRandomEncounterInterval,
  onFinishDelve,
  disabled,
}: {
  dungeonState: DungeonState
  instanceState: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onAdvanceTurn: () => void
  onMarkActed: (characterId: string) => void
  onMoveToken: (characterId: string, toZoneId: string) => void
  onSetRandomEncountersEnabled: (enabled: boolean) => void
  onSetRandomEncounterInterval: (interval: RandomEncounterInterval) => void
  onFinishDelve: () => void
  disabled?: boolean
}) {
  const rosterIds = deriveDungeonRoster(instanceState)
  const acted = new Set(activeActedCharacterIds(dungeonState, rosterIds))
  const reminders = dungeonReminders(dungeonState)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [confirmFinish, setConfirmFinish] = useState(false)

  const liveReminders = reminders.filter(
    (reminder) => !dismissed.has(`${reminder.kind}-${reminder.turn}`)
  )

  const zoneName = (zoneId: string) =>
    instanceState.geometry.zones[zoneId]?.name ?? "?"

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Dungeon turn</p>
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {dungeonState.turnCounter}
            </p>
          </div>
          <Button onClick={onAdvanceTurn} disabled={disabled}>
            Advance turn
            <ArrowRightIcon weight="bold" />
          </Button>
        </div>

        {liveReminders.length > 0 && (
          <ul className="flex flex-col gap-2">
            {liveReminders.map((reminder) => {
              const key = `${reminder.kind}-${reminder.turn}`
              const copy = REMINDER_COPY[reminder.kind]
              return (
                <li key={key}>
                  <Alert className="relative pr-9">
                    <WarningIcon weight="fill" className="size-4" />
                    <AlertTitle>{copy.title}</AlertTitle>
                    <AlertDescription>{copy.body}</AlertDescription>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Dismiss reminder"
                      className="absolute top-1.5 right-1.5"
                      onClick={() =>
                        setDismissed((current) => new Set(current).add(key))
                      }
                    >
                      <XIcon />
                    </Button>
                  </Alert>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-heading text-sm font-medium">
          Party · acted this turn
        </h2>
        {rosterIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens placed.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rosterIds.map((characterId) => (
              <li
                key={characterId}
                className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm"
              >
                <Label className="flex flex-1 cursor-pointer items-center gap-2 truncate hover:opacity-80">
                  <Checkbox
                    checked={acted.has(characterId)}
                    disabled={disabled || acted.has(characterId)}
                    onCheckedChange={() => onMarkActed(characterId)}
                  />
                  <span className="truncate">
                    {roster[characterId]?.name ?? "Unknown"}
                  </span>
                  {acted.has(characterId) && (
                    <Badge variant="secondary">Acted</Badge>
                  )}
                </Label>
                <Select
                  value={instanceState.occupancy[characterId]?.zoneId ?? ""}
                  onValueChange={(value) => {
                    if (value) onMoveToken(characterId, value)
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Move ${roster[characterId]?.name ?? "character"}`}
                    className="w-32 shrink-0"
                  >
                    <SelectValue placeholder="Move to…">
                      {zoneName(
                        instanceState.occupancy[characterId]?.zoneId ?? ""
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(instanceState.geometry.zones).map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading text-sm font-medium">Reminders</h2>
        <Label className="flex items-center justify-between gap-2 text-sm">
          Random encounters
          <Switch
            checked={dungeonState.reminderSettings.randomEncounters.enabled}
            disabled={disabled}
            onCheckedChange={onSetRandomEncountersEnabled}
          />
        </Label>
        {dungeonState.reminderSettings.randomEncounters.enabled && (
          <Select
            value={String(
              dungeonState.reminderSettings.randomEncounters.intervalTurns
            )}
            onValueChange={(value) =>
              onSetRandomEncounterInterval(
                Number(value) as RandomEncounterInterval
              )
            }
            disabled={disabled}
          >
            <SelectTrigger size="sm" aria-label="Random encounter interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {([1, 2, 3, 6] as const).map((interval) => (
                <SelectItem key={interval} value={String(interval)}>
                  {RANDOM_ENCOUNTER_INTERVAL_LABELS[interval]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <Button
        variant="outline"
        onClick={() => setConfirmFinish(true)}
        disabled={disabled}
      >
        <FlagCheckeredIcon weight="bold" />
        Finish delve
      </Button>

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
