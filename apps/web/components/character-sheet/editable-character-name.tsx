"use client"

import { cn } from "@workspace/ui/lib/utils"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterNameAction } from "@/lib/actions/character-name"

const MAX_LENGTH = 64

/**
 * Owner-only inline editor for the character name. Renders as a borderless
 * input styled to match the surrounding `<h1>`. Auto-save fires on a
 * debounced keystroke and unconditionally on blur; Escape reverts to the
 * last server value.
 *
 * No success indicator: the typed value remaining in the input *is* the
 * confirmation. Only failures surface (Sonner toast + local rollback) so the
 * routine-save channel stays quiet and a real error reads as one.
 *
 * All the concurrency + lifecycle plumbing (debounce, in-flight guard,
 * `identityVersion` dual-writer ref, last-saved tracking, focused-prop sync,
 * rollback) lives in {@link useDebouncedAutoSave}. This component is just
 * the rendered input + the keybindings.
 */
export function EditableCharacterName({
  characterId,
  name,
  identityVersion,
}: {
  characterId: string
  name: string
  identityVersion: number
}) {
  const { value, setValue, revert, onFocusChange } = useDebouncedAutoSave({
    serverValue: name,
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEmpty: (next) => next.trim().length === 0,
    isEqual: (a, b) => a.trim() === b.trim(),
    save: async (next, expectedVersion) => {
      const result = await updateCharacterNameAction({
        characterId,
        name: next.trim(),
        expectedVersion,
      })
      if (result.ok) {
        return {
          ok: true,
          value: {
            value: result.value.name,
            version: result.value.version,
          },
        }
      }
      return result
    },
  })

  return (
    <input
      type="text"
      aria-label="Character name"
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
        "font-heading text-2xl font-semibold",
        "max-w-full min-w-0 border-0 bg-transparent p-0 outline-none",
        "border-b border-transparent transition-colors",
        "focus-visible:border-ring focus-visible:ring-0",
        "hover:border-border"
      )}
    />
  )
}
