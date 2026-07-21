"use client"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  useEntityColumnSave,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"

const MAX_LENGTH = 64

/**
 * Movement 4's pronouns input. Quiet sans, small, underline-only — sits just
 * above the serif Name field as a supporting line, never competing for
 * attention. Optional field (empty saves are persisted), same auto-save
 * plumbing as the sibling `NameField` and the sheet's existing
 * `EditablePronouns`.
 */
export function PronounsField() {
  const { profile } = useLoadedCharacter()
  const { value, setValue, revert, onFocusChange } = useEntityColumnSave({
    serverValue: profile.pronouns ?? "",
    isEqual: (a, b) => a.trim() === b.trim(),
    makeWrite: (next) => ({ field: "pronouns", value: next.trim() }),
  })

  return (
    <Field>
      <FieldLabel htmlFor="pronouns">Pronouns (Optional)</FieldLabel>
      <Input
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
      />
    </Field>
  )
}
