"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterNameAction } from "@/lib/actions/character-name"

const MAX_LENGTH = 64

/**
 * Builder-form variant of the editable name (orphaned post-UNN-218 —
 * Movement 4's `NameField` is the live consumer). Same auto-save plumbing as
 * `EditableCharacterName` on the sheet header, with form-input styling.
 */
export function EditableName({
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="character-name">Name</Label>
      <Input
        id="character-name"
        type="text"
        autoComplete="off"
        maxLength={MAX_LENGTH}
        placeholder="Your character's name"
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
