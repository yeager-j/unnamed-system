"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterPronounsAction } from "@/lib/actions/character-identity"

const MAX_LENGTH = 64

/**
 * Owner-only editor for `pronouns` — sibling of `EditableCharacterName`.
 * Like the name editor, the typed value staying in the input is the
 * success indicator; only failures surface (via the auto-save hook's
 * built-in Sonner toast). Empty is allowed: the hook persists the cleared
 * value on blur because pronouns is an optional field, so `isEmpty` is
 * left at the default (`() => false`).
 */
export function EditablePronouns({
  characterId,
  pronouns,
  identityVersion,
}: {
  characterId: string
  pronouns: string
  identityVersion: number
}) {
  const { value, setValue, revert, onFocusChange } = useDebouncedAutoSave({
    serverValue: pronouns,
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="pronouns">Pronouns</Label>
      <Input
        id="pronouns"
        type="text"
        autoComplete="off"
        maxLength={MAX_LENGTH}
        placeholder="they/them"
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
      />
    </div>
  )
}
