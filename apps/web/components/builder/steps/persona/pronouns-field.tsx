"use client"

import { cn } from "@workspace/ui/lib/utils"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterPronounsAction } from "@/lib/actions/character-identity"

const MAX_LENGTH = 64

/**
 * Movement 4's pronouns input. Quiet sans, small, underline-only — sits just
 * above the serif Name field as a supporting line, never competing for
 * attention. Optional field (empty saves are persisted), same auto-save
 * plumbing as the sibling `NameField` and the sheet's existing
 * `EditablePronouns`.
 */
export function PronounsField({
  characterId,
  pronouns,
  identityVersion,
}: {
  characterId: string
  pronouns: string | null
  identityVersion: number
}) {
  const { value, setValue, revert, onFocusChange } = useDebouncedAutoSave({
    serverValue: pronouns ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    save: async (next, expectedVersion) => {
      const result = await updateCharacterPronounsAction({
        characterId,
        pronouns: next.trim(),
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
      aria-label="Pronouns"
      placeholder="they/them"
      autoComplete="off"
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
        "text-sm text-muted-foreground",
        "w-full max-w-xs min-w-0 border-0 bg-transparent p-0 text-center outline-none",
        "border-b border-border pb-1 transition-colors",
        "placeholder:text-muted-foreground/40",
        "focus-visible:border-foreground focus-visible:text-foreground focus-visible:ring-0"
      )}
    />
  )
}
