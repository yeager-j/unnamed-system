"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { Toggle } from "@workspace/ui/components/toggle"
import { cn } from "@workspace/ui/lib/utils"

import { useCharacterWrite } from "@/hooks/use-character"
import { setDuskModeAction } from "@/lib/actions/mechanics/warlock/path-of-dusk"

/**
 * Owner-mode Dusk Mode toggle for the Healer's Path of Dusk.
 * Dispatches a `pathOfDusk` {@link CharacterEdit} through the shared
 * {@link useCharacterWrite} path; the optimistic flag is re-derived on the
 * active Archetype's mechanic state, so the toggle reflects the in-flight
 * value before the server response lands. Violet when on echoes the read-only
 * indicator (and the neighbouring combat-state flags).
 */
export function DuskModeToggle({ duskMode }: { duskMode: boolean }) {
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(next: boolean) {
    write({
      edit: { kind: "pathOfDusk", duskMode: next },
      surface: "mechanic",
      action: (expectedVersion) =>
        setDuskModeAction({ characterId, duskMode: next, expectedVersion }),
    })
  }

  return (
    <Toggle
      variant="outline"
      pressed={duskMode}
      disabled={pending}
      aria-label="Dusk Mode"
      onPressedChange={(next) => dispatch(next)}
      className={cn(
        "text-sm font-medium",
        duskMode &&
          "border-violet-400 text-violet-700 hover:bg-violet-500/25 aria-pressed:bg-violet-500/15 aria-pressed:text-violet-700 data-[state=on]:bg-violet-500/15 data-[state=on]:text-violet-700 dark:text-violet-300 dark:aria-pressed:text-violet-300 dark:data-[state=on]:text-violet-300"
      )}
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
    </Toggle>
  )
}
