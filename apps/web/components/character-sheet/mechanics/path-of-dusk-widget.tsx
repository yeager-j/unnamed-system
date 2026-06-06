"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { type PathOfDuskState } from "@workspace/game/mechanics"

import { useViewerRole } from "@/components/shell/viewer-role"

import { DuskModeToggle } from "./warlock/dusk-mode-toggle"

/**
 * Warlock — Path of Dusk rendering. The widget is just the Dusk Mode indicator:
 * owners get a toggle, everyone else a static badge. Per-enemy Lumina tracking
 * lives in the table's combat tracker, not the app (see the mechanic engine
 * comment).
 */
export function PathOfDuskWidget({ state }: { state: PathOfDuskState }) {
  const role = useViewerRole()

  if (role === "owner") return <DuskModeToggle duskMode={state.duskMode} />

  return <DuskModeBadge duskMode={state.duskMode} />
}

function DuskModeBadge({ duskMode }: { duskMode: boolean }) {
  return (
    <span
      aria-label={duskMode ? "Dusk Mode active" : "Dusk Mode off"}
      className={
        duskMode
          ? "inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-sm font-medium text-violet-700 dark:text-violet-300"
          : "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground"
      }
    >
      {duskMode ? (
        <>
          <MoonIcon weight="fill" aria-hidden />
          Dusk Mode
        </>
      ) : (
        <>
          <SunIcon weight="bold" aria-hidden />
          Inactive
        </>
      )}
    </span>
  )
}
