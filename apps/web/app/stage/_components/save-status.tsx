"use client"

import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The Stage editors' shared save-indicator vocabulary: `saved` once the server
 * has the latest edit, `saving` while a write is in flight, `error` after a
 * failed write (local edits stay; whole-blob saves self-heal on the next edit).
 * Extracted from the Map settings panel when the Set editor became its second
 * consumer.
 */
export type StageSaveStatus = "saved" | "saving" | "error"

const STATUS_DOT: Record<StageSaveStatus, string> = {
  saved: "bg-emerald-500",
  saving: "bg-amber-500",
  error: "bg-destructive",
}

/** The autosave dot + label ("Saved · 2m ago" / "Saving…" / "Couldn't save"). */
export function SaveStatus({
  save,
}: {
  save: { status: StageSaveStatus; lastSavedAt: number | null }
}) {
  const relative = useRelativeTime(save.lastSavedAt)

  const label =
    save.status === "saving"
      ? "Saving…"
      : save.status === "error"
        ? "Couldn't save"
        : save.lastSavedAt && relative
          ? `Saved · ${relative}`
          : "Saved"

  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[save.status])}
        aria-hidden
      />
      {label}
    </span>
  )
}

/** A coarse "x ago" string for a past timestamp relative to `now`. */
function formatRelative(now: number, timestamp: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

/**
 * A relative "x ago" label for a past timestamp, recomputed on a 30s tick so
 * "just now" ages into "1m ago" without another save. Null until there's a
 * timestamp. `now` advances only from the interval callback (never a
 * synchronous setState in render or effect); it's seeded behind the first
 * timestamp so the diff clamps to "just now" until the first tick reads the
 * real clock.
 */
export function useRelativeTime(timestamp: number | null): string | null {
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (timestamp === null) return
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [timestamp])

  if (timestamp === null) return null
  return formatRelative(now, timestamp)
}
