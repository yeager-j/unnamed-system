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

/**
 * The Notes document surface: the shared {@link DocumentEditor} shell bound to
 * the **column door**, not the entity descriptor router. Notes lives on the
 * `profile.notes` app column (table-facing, visible to every viewer — unlike
 * the narrative Secrets), so it saves through {@link useEntityColumnSave}'s
 * replayable `entity.setColumn` intent rather than a `narrative` descriptor. That one
 * storage difference is the reason the writer pane forks Notes to this editor
 * instead of {@link AnimusDocumentEditor}.
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
    makeWrite: (next) => ({ column: "notes", value: next }),
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
