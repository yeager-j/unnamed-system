"use client"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import {
  resolveDocumentContent,
  UNTITLED_CHAIN,
  UNTITLED_KNIFE,
  type DocumentRef,
  type NarrativeDocumentRef,
  type ResolvedDocument,
} from "@/domain/character/animus/documents"
import type { IdentityTraitField } from "@/domain/character/identity-trait-messages"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { useLoadedCharacter } from "@/domain/entity/use-entity-write"

import { useAnimusDocument } from "./animus-context"
import {
  AnimusDocumentEditor,
  type DocumentEditorMessages,
} from "./document-editor"
import { NotesDocumentEditor } from "./notes-document-editor"

/**
 * The right-hand pane of the Animus writer. Reads the active document from
 * {@link useAnimusDocument} and renders the matching editor keyed on the
 * resolved ref so a doc swap unmounts the previous editor (no value bleed
 * between docs).
 *
 * Notes is the one document whose body lives on the `profile.notes` column
 * rather than the `narrative` component, so it forks to {@link NotesDocumentEditor}
 * (bound to the column door) before the narrative resolve — the one place the
 * storage difference surfaces.
 *
 * The `SidebarTrigger` at top-left is `md:hidden` — on desktop the sidebar is
 * permanently visible; on mobile this trigger toggles the built-in `<Sheet>`
 * drawer.
 */
export function WriterPane() {
  const { activeRef } = useAnimusDocument()

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="md:hidden">
        <SidebarTrigger aria-label="Open sections" />
      </div>

      <PaneBody activeRef={activeRef} />
    </div>
  )
}

function PaneBody({ activeRef }: { activeRef: DocumentRef }) {
  const { entity } = useLoadedCharacter()

  if (activeRef.kind === "notes") {
    return <NotesDocumentEditor key="notes:notes" />
  }

  const resolved = resolveDocumentContent(
    activeRef,
    entity.components.narrative
  )

  if (!resolved) {
    return (
      <p className="text-sm text-muted-foreground italic">
        That entry is no longer available. Pick a section from the sidebar.
      </p>
    )
  }

  return <ActiveDocument key={documentKey(resolved.ref)} resolved={resolved} />
}

function ActiveDocument({ resolved }: { resolved: ResolvedDocument }) {
  const { ref, title, body } = resolved
  const { makeTitleWrite, makeBodyWrite, messages } = wireDescriptors(ref)

  // Editable titles (Knives / Chains) carry their own persisted value; fixed
  // titles (Backstory / Identity Traits) display the canonical section label
  // from the ref. `AnimusDocumentEditor` flips the input to read-only when
  // `makeTitleWrite` is undefined, so the styling stays identical either way.
  const displayedTitle = title ?? ref.label

  return (
    <AnimusDocumentEditor
      documentId={documentKey(ref)}
      title={displayedTitle}
      body={body}
      makeTitleWrite={makeTitleWrite}
      makeBodyWrite={makeBodyWrite}
      messages={messages}
    />
  )
}

function documentKey(ref: DocumentRef): string {
  return `${ref.kind}:${ref.id}`
}

/**
 * Wires the active narrative document to its write descriptors — the one place
 * a document kind maps to the narrative ops it edits (`setField` for prose
 * fields, `setListEntry` for a Knife/Chain's title/description). The server
 * merges per field/entry, so two debounced saves can never clobber each other.
 * (Notes is not routed here — it forks to the column door in {@link PaneBody}.)
 */
function wireDescriptors(ref: NarrativeDocumentRef): {
  makeTitleWrite?: (title: string) => EntityWrite
  makeBodyWrite: (body: string) => EntityWrite
  messages: DocumentEditorMessages
} {
  switch (ref.kind) {
    case "backstory":
      return {
        makeBodyWrite: (body) => ({
          component: "narrative",
          op: "setField",
          field: "backstory",
          value: body,
        }),
        messages: {
          bodyAriaLabel: "Backstory",
          bodyPlaceholder:
            "Tell us about your character's life before the adventure…",
          description:
            "Tell us who your character was before the adventure began — what shaped them, what they carry forward, who they used to be. 2-3 paragraphs is sufficient; this becomes the table's reference for the years your character has already lived.",
          saveError: "Couldn't save your Backstory. Try again.",
        },
      }
    case "knife":
      return {
        makeTitleWrite: (title) => ({
          component: "narrative",
          op: "setListEntry",
          list: "knives",
          index: Number(ref.id),
          field: "title",
          value: title,
        }),
        makeBodyWrite: (body) => ({
          component: "narrative",
          op: "setListEntry",
          list: "knives",
          index: Number(ref.id),
          field: "description",
          value: body,
        }),
        messages: {
          bodyAriaLabel: `${ref.label || "Knife"} — description`,
          bodyPlaceholder: "Why does this matter? What's at stake?",
          titlePlaceholder: UNTITLED_KNIFE,
          description:
            "An external stake — a person, place, or thing your character cares about. Be specific: not 'my family' but 'my younger sister Mira, who I promised I'd come back to.' Each Knife is a hook the DM can use to threaten you, and a Victory you can earn defending it.",
          saveError: "Couldn't save the Knife. Try again.",
        },
      }
    case "chain":
      return {
        makeTitleWrite: (title) => ({
          component: "narrative",
          op: "setListEntry",
          list: "chains",
          index: Number(ref.id),
          field: "title",
          value: title,
        }),
        makeBodyWrite: (body) => ({
          component: "narrative",
          op: "setListEntry",
          list: "chains",
          index: Number(ref.id),
          field: "description",
          value: body,
        }),
        messages: {
          bodyAriaLabel: `${ref.label || "Chain"} — description`,
          bodyPlaceholder: "What limits your character? Why does it bind them?",
          titlePlaceholder: UNTITLED_CHAIN,
          description:
            "A Chain is something inside you holding you back from who you're meant to be. Where Knives are external, Chains are internal — the fears, wounds, and lies you've internalized about yourself. A Chain might be a crippling self-doubt born from a past failure. Whatever form it takes, a Chain is the gap between who you are and who you could be.",
          saveError: "Couldn't save the Chain. Try again.",
        },
      }
    case "identity":
      return {
        makeBodyWrite: (body) => ({
          component: "narrative",
          op: "setField",
          field: ref.id,
          value: body,
        }),
        messages: {
          bodyAriaLabel: ref.label,
          bodyPlaceholder: `Write your ${ref.label}…`,
          description: identityDescriptionFor(ref.id),
          saveError: `Couldn't save your ${ref.label}. Try again.`,
        },
      }
  }
}

function identityDescriptionFor(field: IdentityTraitField): string {
  switch (field) {
    case "personality":
      return "A Personality Trait is a small, specific habit or quirk that makes your character recognizable at the table. The strongest Personality Traits are things another player at the table could mimic after one session. Write 2-4 Personality Traits."
    case "hopes":
      return "A Hope is a short-term, realistic goal your character is actively working toward. Hopes are the engine of your character's near-term decisions, and they should be concrete enough that you and the DM can recognize when one is fulfilled. Write 1-2 Hopes."
    case "dreams":
      return "A Dream is a long-term, larger-than-life goal your character cannot achieve alone — and may not achieve in their lifetime. Where Hopes drive your character's next session, Dreams drive their whole life. Examples include ending a century-long war between two kingdoms or creating a world without lawyers. Write one Dream."
    case "fears":
      return "A Fear is something that paralyzes your character *right now* but which they can plausibly overcome through the events of the campaign. Every Fear emerges from a specific trauma in your character's past. The fear itself (whether concrete or abstract) is important, but what matters more is the wound underneath it. Write 1-2 Fears."
    case "secrets":
      return "A Secret is something only your character (and perhaps a very small circle of others) knows, and which would be devastating if revealed. A Secret does not have to be about your character — it might be that you accidentally killed your brother, or it might be that you know the King is a Lich. Write 1-2 Secrets."
  }
}
