"use client"

import { WarningIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { dungeonReminders } from "@workspace/game/engine"
import type { DungeonState } from "@workspace/game/foundation"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { CanvasPanel } from "@/components/shared/canvas/canvas-panel"
import { DUNGEON_REMINDER_COPY } from "@/lib/ui/labels"

/**
 * The run console's floating top-left panel (UNN-464 chrome pass) — the play
 * counterpart of the editor's {@link import("@/components/maps/map-settings-panel").MapSettingsPanel}.
 * A back arrow to the campaign, the dungeon name, and a LIVE status dot, with the
 * turn-driven reminder Alerts stacked **below** the panel (dismissal is
 * component-local UI state, never persisted — PRD FR-4). The board is full-bleed
 * behind it; this is the only chrome over the top-left.
 */
export function DungeonStatusPanel({
  name,
  campaignShortId,
  dungeonState,
}: {
  name: string
  campaignShortId: string
  dungeonState: DungeonState
}) {
  const reminders = dungeonReminders(dungeonState)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const liveReminders = reminders.filter(
    (reminder) => !dismissed.has(`${reminder.kind}-${reminder.turn}`)
  )

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2">
      <div className="pointer-events-auto">
        <CanvasPanel
          backHref={`/campaigns/${campaignShortId}`}
          backLabel="Back to campaign"
          title={name}
          actions={
            <span className="flex items-center gap-1.5 pr-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-2 bg-emerald-500" aria-hidden />
              LIVE
            </span>
          }
        />
      </div>

      {liveReminders.length > 0 && (
        <ul className="pointer-events-auto flex flex-col gap-2">
          {liveReminders.map((reminder) => {
            const key = `${reminder.kind}-${reminder.turn}`
            const copy = DUNGEON_REMINDER_COPY[reminder.kind]
            return (
              <li key={key}>
                <Alert className="relative bg-popover pr-9 shadow-lg">
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
    </div>
  )
}
