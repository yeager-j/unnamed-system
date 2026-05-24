"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterNameAction } from "@/lib/actions/character-name"
import { DRAFT_NAME_PLACEHOLDER } from "@/lib/db/start-character-draft"

const MAX_LENGTH = 64

/**
 * Builder-form variant of the editable name. Same auto-save plumbing as
 * `EditableCharacterName` on the sheet header, but with form-input styling
 * rather than the borderless h1 look the sheet uses. Empty input is
 * skipped at the hook level (no save dispatched) and snaps back on blur,
 * so the player can backspace through the seeded placeholder without
 * leaving the field in a broken state.
 *
 * When the field still holds the seeded `DRAFT_NAME_PLACEHOLDER`, focusing
 * the input auto-selects so the player can type their name directly
 * instead of clearing first.
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
        onFocus={(event) => {
          onFocusChange(true)
          // setSelectionRange has to run synchronously in the focus
          // handler — deferring it (e.g. via rAF) lets React's
          // controlled-input re-commit collapse the selection back to a
          // caret position.
          if (event.currentTarget.value === DRAFT_NAME_PLACEHOLDER) {
            event.currentTarget.setSelectionRange(
              0,
              event.currentTarget.value.length
            )
          }
        }}
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
