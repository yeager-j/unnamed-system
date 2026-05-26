"use client"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterNarrativeAction } from "@/lib/actions/character-narrative"

/**
 * Movement 2's two short setting-defined slots — Ancestry and Background
 * (rulebook 1.4, ADR-002 §"Movement 2 — The Past"). Single-line text fields
 * with rules-cited ghost text. Each auto-saves through the shared
 * `useDebouncedAutoSave` hook on the identity write class.
 *
 * Backstory is intentionally NOT here — it moved to the Animus writer view
 * (UNN-217) where all prose lives as Markdown.
 */
const ANCESTRY_MAX = 160
const BACKGROUND_MAX = 160

export function NarrativePair({
  characterId,
  ancestryText,
  backgroundText,
  identityVersion,
}: {
  characterId: string
  ancestryText: string | null
  backgroundText: string | null
  identityVersion: number
}) {
  return (
    <div className="flex flex-col gap-5">
      <SingleLineField
        characterId={characterId}
        field="ancestry"
        label="Ancestry"
        description="Setting-defined: ask your DM what the campaign offers. Free text — bonuses live in the relevant section, not parsed from here."
        placeholder="e.g. Half-elf, Tiefling, Dwarf…"
        maxLength={ANCESTRY_MAX}
        serverValue={ancestryText ?? ""}
        identityVersion={identityVersion}
      />
      <SingleLineField
        characterId={characterId}
        field="background"
        label="Background"
        description="What did your character do before the adventure? A noble, a thief, a soldier? Setting-defined, like Ancestry."
        placeholder="e.g. Disgraced noble, Street thief, Battlefield medic…"
        maxLength={BACKGROUND_MAX}
        serverValue={backgroundText ?? ""}
        identityVersion={identityVersion}
      />
    </div>
  )
}

function SingleLineField({
  characterId,
  field,
  label,
  description,
  placeholder,
  maxLength,
  serverValue,
  identityVersion,
}: {
  characterId: string
  field: "ancestry" | "background"
  label: string
  description: string
  placeholder: string
  maxLength: number
  serverValue: string
  identityVersion: number
}) {
  const { value, setValue, revert, onFocusChange } = useDebouncedAutoSave({
    serverValue,
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    save: async (next, expectedVersion) => {
      const result = await updateCharacterNarrativeAction({
        characterId,
        field,
        text: next,
        expectedVersion,
      })
      if (result.ok) {
        return {
          ok: true,
          value: { value: next, version: result.value.version },
        }
      }
      return result
    },
  })

  const inputId = `character-${field}`

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <Input
        id={inputId}
        type="text"
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
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
