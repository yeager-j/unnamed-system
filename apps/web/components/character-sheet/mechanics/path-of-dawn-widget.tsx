"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { type PathOfDawnState } from "@workspace/game/foundation"

import { useViewerRole } from "@/components/shell/viewer-role"

import { DawnModeToggle } from "./healer/dawn-mode-toggle"

/**
 * Healer — Path of Dawn rendering. The widget is just the Dawn Mode indicator:
 * owners get a toggle, everyone else a static badge. Per-enemy Lumina tracking
 * lives in the table's combat tracker, not the app (see the mechanic engine
 * comment).
 */
export function PathOfDawnWidget({ state }: { state: PathOfDawnState }) {
  const role = useViewerRole()

  if (role === "owner") return <DawnModeToggle dawnMode={state.dawnMode} />

  return <DawnModeBadge dawnMode={state.dawnMode} />
}

function DawnModeBadge({ dawnMode }: { dawnMode: boolean }) {
  return (
    <span
      aria-label={dawnMode ? "Dawn Mode active" : "Dawn Mode off"}
      className={
        dawnMode
          ? "inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-300"
          : "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground"
      }
    >
      {dawnMode ? (
        <>
          <SunIcon weight="fill" aria-hidden />
          Dawn Mode
        </>
      ) : (
        <>
          <MoonIcon weight="bold" aria-hidden />
          Inactive
        </>
      )}
    </span>
  )
}
