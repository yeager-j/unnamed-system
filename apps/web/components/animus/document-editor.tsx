"use client"

import { toast } from "sonner"

import { DocumentEditor } from "@/components/editor/document-editor"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { useEntityAutoSave } from "@/domain/entity/use-entity-write"

/**
 * The Animus writer's narrative document surface: the shared
 * {@link DocumentEditor} shell bound to the **entity door** — two independent
 * {@link useEntityAutoSave} instances drive title and body. Both dispatch
 * identity-class narrative descriptors through the provider's shared token +
 * queue (UNN-274), so the title's bump is visible to the body's next save
 * in-frame — no version race between them — and the server merges each write
 * per field/entry, so they can't clobber each other.
 *
 * Every narrative document — editable (Knives / Chains) or fixed (Backstory /
 * Identity Traits) — renders the same shell. Fixed documents pass no
 * `makeTitleWrite`, which flips the title to `readOnly` so the styling and
 * rhythm stay identical across kinds. (Notes renders a sibling editor bound to
 * the column door — see `NotesDocumentEditor`.)
 */
export interface DocumentEditorMessages {
  /** Aria label for the body editor. Should describe the document. */
  bodyAriaLabel: string
  /** Placeholder shown in the body editor when empty. */
  bodyPlaceholder: string
  /**
   * Placeholder shown when the title is empty. Only meaningful for
   * editable docs (Knives / Chains); fixed docs always have a value.
   */
  titlePlaceholder?: string
  /**
   * Two-to-three sentences of guidance shown between the title and the
   * body editor. Pulled from the rulebook so each document carries its
   * own framing without the player having to look it up.
   */
  description: string
  /** Toast text on a save failure. */
  saveError: string
}

export function AnimusDocumentEditor({
  documentId,
  title,
  body,
  makeTitleWrite,
  makeBodyWrite,
  messages,
}: {
  /** Stable per-document id, forwarded to the shell for label association. */
  documentId: string
  title: string
  body: string
  /**
   * When omitted, the title input is rendered `readOnly` (Backstory and
   * Identity Traits — the player can't rename the section name).
   */
  makeTitleWrite?: (title: string) => EntityWrite
  makeBodyWrite: (body: string) => EntityWrite
  messages: DocumentEditorMessages
}) {
  const onError = () => toast.error(messages.saveError)
  const isTitleEditable = !!makeTitleWrite

  const titleState = useEntityAutoSave({
    serverValue: title,
    isEqual: (a, b) => a.trim() === b.trim(),
    // No `isEmpty` guard — clearing the title is a legitimate edit. The
    // sidebar renders "Untitled Knife" / "Untitled Chain" as a fallback label
    // when the saved title is empty; the editor's own placeholder cues the
    // player to type one.
    onError,
    // A fixed title never dispatches: without a descriptor builder there is
    // nothing to write, so the no-op builder below is unreachable (the input
    // is readOnly). The narrowing keeps one hook call for both shapes.
    makeWrite: (next) =>
      makeTitleWrite
        ? makeTitleWrite(next.trim())
        : {
            component: "narrative",
            op: "setField",
            field: "backstory",
            value: next,
          },
  })

  const bodyState = useEntityAutoSave({
    serverValue: body,
    isEqual: (a, b) => a.trim() === b.trim(),
    onError,
    makeWrite: (next) => makeBodyWrite(next),
  })

  return (
    <DocumentEditor
      documentId={documentId}
      title={titleState}
      titleReadOnly={!isTitleEditable}
      body={bodyState}
      messages={{
        bodyAriaLabel: messages.bodyAriaLabel,
        bodyPlaceholder: messages.bodyPlaceholder,
        titlePlaceholder: messages.titlePlaceholder,
        description: messages.description,
      }}
    />
  )
}
