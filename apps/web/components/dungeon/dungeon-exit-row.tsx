"use client"

import {
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  LockOpenIcon,
} from "@phosphor-icons/react/dist/ssr"

import { type ZoneExit } from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"

/**
 * One exit out of a Zone in the
 * {@link import("./dungeon-zone-sheet").DungeonZoneSheet} — the neighbor name, a
 * hidden/open · locked · unrevealed status line, and the DM's reveal/hide controls
 * (for an authored-secret passage) + unlock/re-lock controls (for an authored-locked
 * one). Reveal + unlock are player-visible and confirm upstream; hide + re-lock are
 * immediate. Presentational — all four gestures are supplied by the sheet body.
 */
export function ExitRow({
  exit,
  disabled,
  onReveal,
  onHide,
  onUnlock,
  onRelock,
}: {
  exit: ZoneExit
  disabled?: boolean
  onReveal: () => void
  onHide: () => void
  onUnlock: () => void
  onRelock: () => void
}) {
  const {
    connection,
    neighborName,
    neighborRevealed,
    hiddenFromPlayers,
    locked,
  } = exit

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{neighborName}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {hiddenFromPlayers ? (
            <span className="text-amber-700 dark:text-amber-500">hidden</span>
          ) : (
            <span>open</span>
          )}
          {locked && (
            <>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-0.5">
                <LockIcon className="size-3" /> locked
              </span>
            </>
          )}
          {!neighborRevealed && (
            <>
              <span aria-hidden>·</span>
              <span>unrevealed</span>
            </>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {connection.hidden &&
          (hiddenFromPlayers ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onReveal}
            >
              <EyeIcon /> Reveal
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={onHide}
            >
              <EyeSlashIcon /> Hide
            </Button>
          ))}
        {connection.locked &&
          (locked ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={onUnlock}
            >
              <LockOpenIcon /> Unlock
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={onRelock}
            >
              <LockIcon /> Re-lock
            </Button>
          ))}
      </div>
    </li>
  )
}
