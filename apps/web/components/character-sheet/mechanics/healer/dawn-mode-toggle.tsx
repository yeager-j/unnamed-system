"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { Toggle } from "@workspace/ui/components/toggle"
import { cn } from "@workspace/ui/lib/utils"

import { useCharacterWrite } from "@/hooks/use-character"
import { setDawnModeAction } from "@/lib/actions/mechanics/healer/path-of-dawn"

/**
 * Owner-mode Dawn Mode toggle for the Healer's Path of Dawn (UNN-230).
 * Dispatches a `pathOfDawn` {@link CharacterEdit} through the shared
 * {@link useCharacterWrite} path; the optimistic flag is re-derived on the
 * active Archetype's mechanic state, so the toggle reflects the in-flight
 * value before the server response lands. Amber when on echoes the read-only
 * indicator (and the neighbouring combat-state flags).
 */
export function DawnModeToggle({ dawnMode }: { dawnMode: boolean }) {
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(next: boolean) {
    write({
      edit: { kind: "pathOfDawn", dawnMode: next },
      characterClass: "vitals",
      action: (expectedVersion) =>
        setDawnModeAction({ characterId, dawnMode: next, expectedVersion }),
    })
  }

  return (
    <Toggle
      variant="outline"
      pressed={dawnMode}
      disabled={pending}
      aria-label="Dawn Mode"
      onPressedChange={(next) => dispatch(next)}
      className={cn(
        "text-sm font-medium",
        dawnMode &&
          "border-amber-400 text-amber-700 hover:bg-amber-500/25 aria-pressed:bg-amber-500/15 aria-pressed:text-amber-700 data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-700 dark:text-amber-300 dark:aria-pressed:text-amber-300 dark:data-[state=on]:text-amber-300"
      )}
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
    </Toggle>
  )
}
