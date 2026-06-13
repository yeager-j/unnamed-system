"use client"

import { FlameIcon } from "@phosphor-icons/react"

import { Toggle } from "@workspace/ui/components/toggle"
import { cn } from "@workspace/ui/lib/utils"

import { useCharacterWrite } from "@/hooks/use-character"
import { setFrenzyModeAction } from "@/lib/actions/mechanics/berserker/frenzy"

/**
 * Owner-mode Frenzy Mode toggle for the Berserker's Frenzy mechanic. Dispatches
 * a `frenzyMode` {@link CharacterEdit} through the shared {@link useCharacterWrite}
 * path; the optimistic flag is re-derived on the active Archetype's mechanic
 * state, so the toggle reflects the in-flight value before the server response
 * lands. Red when on echoes the read-only badge. `disabled` is set by the widget
 * when Pain is 0 — Frenzy can't be entered without at least 1 Pain.
 */
export function FrenzyToggle({
  frenzyMode,
  disabled,
}: {
  frenzyMode: boolean
  disabled?: boolean
}) {
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(next: boolean) {
    write({
      edit: { kind: "frenzyMode", frenzyMode: next },
      surface: "mechanic",
      action: (expectedVersion) =>
        setFrenzyModeAction({ characterId, frenzyMode: next, expectedVersion }),
    })
  }

  return (
    <Toggle
      variant="outline"
      pressed={frenzyMode}
      disabled={pending || disabled}
      aria-label="Frenzy Mode"
      onPressedChange={(next) => dispatch(next)}
      className={cn(
        "text-sm font-medium",
        frenzyMode &&
          "border-red-400 text-red-700 hover:bg-red-500/25 aria-pressed:bg-red-500/15 aria-pressed:text-red-700 data-[state=on]:bg-red-500/15 data-[state=on]:text-red-700 dark:text-red-300 dark:aria-pressed:text-red-300 dark:data-[state=on]:text-red-300"
      )}
    >
      <FlameIcon weight={frenzyMode ? "fill" : "bold"} aria-hidden />
      {frenzyMode ? "Frenzy Mode" : "Inactive"}
    </Toggle>
  )
}
