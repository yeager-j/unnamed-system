"use client"

import { toast } from "sonner"

import {
  DocumentEditor,
  type DocumentFieldState,
} from "@/components/editor/document-editor"
import {
  useEntityColumnSave,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { applyIdentityWriteAction } from "@/lib/actions/entity/mutations/apply-identity"

/**
 * The Notes document surface: the shared {@link DocumentEditor} shell bound to
 * the **identity door**, not the entity descriptor router. Notes lives on the
 * `profile.notes` app column (table-facing, visible to every viewer — unlike
 * the narrative Secrets), so it saves through {@link useEntityColumnSave} + the
 * `notes` arm of `entity.identity` rather than a `narrative` descriptor. That one
 * storage difference is the reason the writer pane forks Notes to this editor
 * instead of {@link AnimusDocumentEditor} — both write species now share one
 * mutation protocol, but not one descriptor (UNN-675).
 *
 * The title is the fixed section name "Notes" (read-only) — Notes has no
 * player-editable heading, matching Backstory and the Identity Traits.
 */
const NOTES_TITLE: DocumentFieldState = {
  value: "Notes",
  setValue: () => {},
  onFocusChange: () => {},
}

export function NotesDocumentEditor() {
  const { profile } = useLoadedCharacter()

  const bodyState = useEntityColumnSave({
    serverValue: profile.notes ?? "",
    isEqual: (a, b) => a.trim() === b.trim(),
    onError: () => toast.error("Couldn't save your Notes. Try again."),
    save: async (next, { entityId }) => {
      const result = await applyIdentityWriteAction({
        entityId,
        write: { field: "notes", value: next },
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
    <DocumentEditor
      documentId="notes:notes"
      title={NOTES_TITLE}
      titleReadOnly
      body={bodyState}
      messages={{
        bodyAriaLabel: "Notes",
        bodyPlaceholder: "Jot down anything you want to remember…",
        description:
          "Free-form notes for your own reference. Unlike your Secrets, these are visible to anyone viewing your sheet.",
      }}
    />
  )
}
