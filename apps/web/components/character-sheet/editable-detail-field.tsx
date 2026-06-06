"use client"

import type { Result } from "@workspace/game/foundation/result"
import { cn } from "@workspace/ui/lib/utils"

import { useCharacterAutoSave } from "@/hooks/use-character"
import { updateCharacterPronounsAction } from "@/lib/actions/character-identity"
import { updateCharacterNarrativeAction } from "@/lib/actions/character-narrative"
import type { EditSurface } from "@/lib/db/version-classes"

/**
 * Owner-only inline editor for a single-line identity detail (Pronouns,
 * Ancestry, Background) on the Explore tab's Background block. Renders as a
 * borderless input styled to match the resting read-only line, so the edit
 * happens in place: a hover underline hints it's editable, focus brings up the
 * ring. Auto-save fires on a debounced keystroke and on blur; Escape reverts.
 *
 * Unlike {@link EditableCharacterName}, **empty is a valid value** here — the
 * field clears to `null` and the public sheet falls back to "None recorded." —
 * so no `isEmpty` revert-on-blur is passed. The lifecycle plumbing lives in
 * {@link useCharacterAutoSave} and the core hook it wraps; the `field`
 * discriminant picks the Server
 * Action (Pronouns and the two narrative slots ride different actions but the
 * same `identity` write class), mirroring the builder's `SingleLineField`.
 */
const FIELD_SURFACE = {
  pronouns: "pronouns",
  ancestry: "narrative",
  background: "narrative",
} as const satisfies Record<DetailField, EditSurface>

type DetailField = "pronouns" | "ancestry" | "background"

export function EditableDetailField({
  characterId,
  field,
  label,
  serverValue,
  placeholder,
  maxLength,
}: {
  characterId: string
  field: DetailField
  label: string
  serverValue: string
  placeholder: string
  maxLength: number
}) {
  const { value, setValue, revert, onFocusChange } = useCharacterAutoSave({
    serverValue,
    characterId,
    surface: FIELD_SURFACE[field],
    isEqual: (a, b) => a.trim() === b.trim(),
    save: (next, expectedVersion) =>
      saveDetail(characterId, field, next.trim(), expectedVersion),
  })

  return (
    <input
      type="text"
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
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
        "text-sm",
        "w-full min-w-0 border-0 bg-transparent p-0 outline-none",
        "border-b border-transparent transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-0",
        "hover:border-border"
      )}
    />
  )
}

async function saveDetail(
  characterId: string,
  field: DetailField,
  text: string,
  expectedVersion: number
): Promise<Result<{ value: string; version: number }, string>> {
  const result =
    field === "pronouns"
      ? await updateCharacterPronounsAction({
          characterId,
          pronouns: text,
          expectedVersion,
        })
      : await updateCharacterNarrativeAction({
          characterId,
          field,
          text,
          expectedVersion,
        })

  if (result.ok) {
    return { ok: true, value: { value: text, version: result.value.version } }
  }
  return result
}
