"use client"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  CharacterRoot,
  useCharacterEntityAutoSave,
} from "@/domain/character/client"

/**
 * Movement 2's two short setting-defined slots — Ancestry and Background
 * (rulebook 1.4, ADR-002 §"Movement 2 — The Past"). Single-line text fields
 * with rules-cited ghost text. Each auto-saves as a `narrative.setField`
 * descriptor through the shared debounced-autosave lifecycle (identity class).
 *
 * Backstory is intentionally NOT here — it lives in the Animus writer
 * (Movement 3) where all long-form prose is edited as Markdown.
 */
const ANCESTRY_MAX = 160
const BACKGROUND_MAX = 160

export function NarrativePair() {
  const { entity } = CharacterRoot.useRoot().value
  const narrative = entity.components.narrative

  return (
    <div className="flex flex-col gap-5">
      <SingleLineField
        field="ancestry"
        label="Ancestry"
        description="Setting-defined: ask your DM what the campaign offers. Free text — bonuses live in the relevant section, not parsed from here."
        placeholder="e.g. Half-elf, Tiefling, Dwarf…"
        maxLength={ANCESTRY_MAX}
        serverValue={narrative?.ancestry ?? ""}
      />
      <SingleLineField
        field="background"
        label="Background"
        description="What did your character do before the adventure? A noble, a thief, a soldier? Setting-defined, like Ancestry."
        placeholder="e.g. Disgraced noble, Street thief, Battlefield medic…"
        maxLength={BACKGROUND_MAX}
        serverValue={narrative?.background ?? ""}
      />
    </div>
  )
}

function SingleLineField({
  field,
  label,
  description,
  placeholder,
  maxLength,
  serverValue,
}: {
  field: "ancestry" | "background"
  label: string
  description: string
  placeholder: string
  maxLength: number
  serverValue: string
}) {
  const { value, setValue, revert, onFocusChange } = useCharacterEntityAutoSave(
    {
      serverValue,
      isEqual: (a, b) => a.trim() === b.trim(),
      makeWrite: (next) => ({
        component: "narrative",
        op: "setField",
        field,
        value: next,
      }),
    }
  )

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
