"use client"

import { cn } from "@workspace/ui/lib/utils"

import {
  useEntityColumnSave,
  useLoadedCharacter,
} from "@/hooks/use-entity-write"
import { updateEntityNameAction } from "@/lib/actions/entity/columns"

const MAX_LENGTH = 64

/**
 * Movement 4's name input. ADR-002 spells out the treatment: serif, large
 * (~32–36px), no field chrome — just an underline as the input baseline. The
 * name is the visual climax of the builder; everything else on the page is
 * supporting it. Auto-focused on mount so the player can start typing
 * immediately.
 *
 * Reuses the same debounced-autosave plumbing as the sheet header's editable
 * name (debounced keystroke + blur save, optimistic concurrency on the
 * identity token, Escape-revert) — a classic per-field column action.
 */
export function NameField() {
  const { profile } = useLoadedCharacter()
  const { value, setValue, revert, onFocusChange } = useEntityColumnSave({
    serverValue: profile.name,
    isEmpty: (next) => next.trim().length === 0,
    isEqual: (a, b) => a.trim() === b.trim(),
    save: async (next, { entityId, expectedVersion }) => {
      const result = await updateEntityNameAction({
        entityId,
        name: next.trim(),
        expectedVersion,
      })
      if (result.ok) {
        return {
          ok: true,
          value: { value: next.trim(), version: result.value.version },
        }
      }
      return result
    },
  })

  return (
    <input
      type="text"
      aria-label="Character name"
      placeholder="Name"
      autoComplete="off"
      autoFocus
      maxLength={MAX_LENGTH}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          event.preventDefault()
          revert()
          event.currentTarget.blur()
        }
      }}
      className={cn(
        "font-display text-3xl font-semibold sm:text-4xl",
        "w-full max-w-md min-w-0 border-0 bg-transparent p-0 text-center outline-none",
        "border-b border-border pb-2 transition-colors",
        "placeholder:text-muted-foreground/40",
        "focus-visible:border-foreground focus-visible:ring-0"
      )}
    />
  )
}
