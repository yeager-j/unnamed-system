"use client"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { MarkdownField } from "@/components/editor/markdown-field"
import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterNarrativeAction } from "@/lib/actions/character-narrative"

/**
 * The three Step-3 free-text fields: Ancestry, Background, Backstory
 * (rulebook 1.4, PRD §5.1 step 3). Ancestry & Background are short
 * setting-defined slots — single-line inputs. Backstory is the long-form
 * narrative — Markdown editor.
 *
 * Every field auto-saves through the shared {@link useDebouncedAutoSave}
 * hook on the identity write class. All three are independent saves; an
 * in-flight Backstory edit doesn't block (or get blocked by) an Ancestry
 * blur — the silent-retry pipeline handles the same-class race.
 */
const ANCESTRY_MAX = 160
const BACKGROUND_MAX = 160

export function NarrativeFields({
  characterId,
  ancestryText,
  backgroundText,
  backstoryText,
  identityVersion,
}: {
  characterId: string
  ancestryText: string | null
  backgroundText: string | null
  backstoryText: string | null
  identityVersion: number
}) {
  const backstory = useDebouncedAutoSave({
    serverValue: backstoryText ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    save: async (next, expectedVersion) => {
      const result = await updateCharacterNarrativeAction({
        characterId,
        field: "backstory",
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
      <Field>
        <FieldLabel id="character-backstory-label">Backstory</FieldLabel>
        <FieldDescription>
          Tell us who your character was before the adventure began — what
          shaped them, what they carry forward. Use Markdown shortcuts (`#
          heading`, `- list`, `**bold**`) and standard keyboard formatting.
        </FieldDescription>
        <MarkdownField
          ariaLabel="Backstory"
          ariaLabelledBy="character-backstory-label"
          placeholder="Tell us about your character's life before the adventure…"
          value={backstory.value}
          onChange={backstory.setValue}
          onFocus={() => backstory.onFocusChange(true)}
          onBlur={() => backstory.onFocusChange(false)}
        />
      </Field>
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
