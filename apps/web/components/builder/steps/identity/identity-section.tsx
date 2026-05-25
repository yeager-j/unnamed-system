"use client"

import { toast } from "sonner"

import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"

import { MarkdownField } from "@/components/editor/markdown-field"
import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import { updateCharacterIdentityListAction } from "@/lib/actions/character-identity-lists"
import type { IdentityListField } from "@/lib/db/character-identity-lists"

import { IDENTITY_LIST_MESSAGES } from "./messages"

/**
 * One Step-4 Identity section — a labeled `FieldSet` wrapping a single
 * `MarkdownField` that auto-saves to the matching `character.<field>`
 * column. Mirrors the Backstory branch of `narrative-fields.tsx` on the
 * previous step; both run the identity write-class through the same
 * debounced auto-save pipeline so concurrent saves on different sections
 * race correctly via the silent-retry path.
 */
export function IdentitySection({
  characterId,
  identityVersion,
  field,
  serverValue,
}: {
  characterId: string
  identityVersion: number
  field: IdentityListField
  serverValue: string | null
}) {
  const messages = IDENTITY_LIST_MESSAGES[field]

  const { value, setValue, onFocusChange } = useDebouncedAutoSave({
    serverValue: serverValue ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    onError: () => toast.error(`Couldn't save your ${messages.label}.`),
    save: async (next, expectedVersion) => {
      const result = await updateCharacterIdentityListAction({
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

  return (
    <FieldSet>
      <FieldLegend>{messages.label}</FieldLegend>
      <FieldDescription>{messages.description}</FieldDescription>
      <MarkdownField
        ariaLabel={messages.label}
        placeholder={messages.placeholder}
        value={value}
        onChange={setValue}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      />
    </FieldSet>
  )
}
