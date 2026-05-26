"use client"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import {
  updateCharacterChainDescriptionAction,
  updateCharacterChainTitleAction,
} from "@/lib/actions/character-chains"
import { updateCharacterIdentityTraitAction } from "@/lib/actions/character-identity-traits"
import {
  updateCharacterKnifeDescriptionAction,
  updateCharacterKnifeTitleAction,
} from "@/lib/actions/character-knives"
import { updateCharacterNarrativeAction } from "@/lib/actions/character-narrative"
import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/load-character"

import { useAnimusDocument } from "./animus-context"
import {
  DocumentEditor,
  type DocumentEditorActions,
  type DocumentEditorMessages,
} from "./document-editor"
import {
  resolveDocumentContent,
  type DocumentRef,
  type ResolvedDocument,
} from "./documents"

/**
 * The right-hand pane of the Movement 3 writer. Reads the active document
 * from {@link useAnimusDocument}, resolves it against the loaded character
 * data, and renders a {@link DocumentEditor} keyed on the resolved ref so a
 * doc swap unmounts the previous editor (no value bleed between docs).
 *
 * The `SidebarTrigger` at top-left is `md:hidden` — on desktop the sidebar
 * is permanently visible; on mobile this trigger toggles the built-in
 * `<Sheet>` drawer.
 */
export function WriterPane({
  characterId,
  identityVersion,
  backstoryText,
  knives,
  chains,
  personalityTraits,
  hopes,
  dreams,
  fears,
  secrets,
}: {
  characterId: string
  identityVersion: number
  backstoryText: string | null
  knives: readonly CharacterKnifeRow[]
  chains: readonly CharacterChainRow[]
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
}) {
  const { activeRef } = useAnimusDocument()

  const resolved = resolveDocumentContent(activeRef, {
    backstoryText,
    knives,
    chains,
    personalityTraits,
    hopes,
    dreams,
    fears,
    secrets,
  })

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="md:hidden">
        <SidebarTrigger aria-label="Open sections" />
      </div>

      {resolved ? (
        <ActiveDocument
          key={documentKey(resolved.ref)}
          characterId={characterId}
          identityVersion={identityVersion}
          resolved={resolved}
        />
      ) : (
        <p className="text-sm text-muted-foreground italic">
          That entry is no longer available. Pick a section from the sidebar.
        </p>
      )}
    </div>
  )
}

function ActiveDocument({
  characterId,
  identityVersion,
  resolved,
}: {
  characterId: string
  identityVersion: number
  resolved: ResolvedDocument
}) {
  const { ref, title, body } = resolved
  const heading = headingFor(ref)
  const { actions, messages } = wireActions({
    characterId,
    ref,
  })

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {heading ? (
        <h2 className="font-heading text-2xl text-foreground sm:text-3xl">
          {heading}
        </h2>
      ) : null}

      <DocumentEditor
        characterId={characterId}
        identityVersion={identityVersion}
        documentId={documentKey(ref)}
        title={title}
        body={body}
        actions={actions}
        messages={messages}
      />
    </div>
  )
}

const UNTITLED_KNIFE = "Untitled Knife"
const UNTITLED_CHAIN = "Untitled Chain"

function documentKey(ref: DocumentRef): string {
  return `${ref.kind}:${ref.id}`
}

/**
 * Backstory + Identity Traits render a fixed serif heading above the body
 * (the player can't rename these). Knives + Chains render the title as an
 * editable input inside the DocumentEditor, so this returns `null` for
 * them.
 */
function headingFor(ref: DocumentRef): string | null {
  if (ref.kind === "backstory" || ref.kind === "identity") return ref.label
  return null
}

function wireActions({
  characterId,
  ref,
}: {
  characterId: string
  ref: DocumentRef
}): { actions: DocumentEditorActions; messages: DocumentEditorMessages } {
  switch (ref.kind) {
    case "backstory":
      return {
        actions: {
          updateDescription: async (text, expectedVersion) => {
            const result = await updateCharacterNarrativeAction({
              characterId,
              field: "backstory",
              text: text ?? "",
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
        },
        messages: {
          bodyAriaLabel: "Backstory",
          bodyPlaceholder:
            "Tell us about your character's life before the adventure…",
          saveError: "Couldn't save your Backstory. Try again.",
        },
      }
    case "knife":
      return {
        actions: {
          updateTitle: async (title, expectedVersion) => {
            const result = await updateCharacterKnifeTitleAction({
              characterId,
              knifeId: ref.id,
              title,
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
          updateDescription: async (text, expectedVersion) => {
            const result = await updateCharacterKnifeDescriptionAction({
              characterId,
              knifeId: ref.id,
              description: text ?? "",
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
        },
        messages: {
          bodyAriaLabel: `${ref.label || "Knife"} — description`,
          bodyPlaceholder: "Why does this matter? What's at stake?",
          titlePlaceholder: UNTITLED_KNIFE,
          saveError: "Couldn't save the Knife. Try again.",
        },
      }
    case "chain":
      return {
        actions: {
          updateTitle: async (title, expectedVersion) => {
            const result = await updateCharacterChainTitleAction({
              characterId,
              chainId: ref.id,
              title,
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
          updateDescription: async (text, expectedVersion) => {
            const result = await updateCharacterChainDescriptionAction({
              characterId,
              chainId: ref.id,
              description: text ?? "",
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
        },
        messages: {
          bodyAriaLabel: `${ref.label || "Chain"} — description`,
          bodyPlaceholder: "What limits your character? Why does it bind them?",
          titlePlaceholder: UNTITLED_CHAIN,
          saveError: "Couldn't save the Chain. Try again.",
        },
      }
    case "identity":
      return {
        actions: {
          updateDescription: async (text, expectedVersion) => {
            const result = await updateCharacterIdentityTraitAction({
              characterId,
              field: ref.id,
              text: text ?? "",
              expectedVersion,
            })
            if (result.ok) {
              return { ok: true, value: { version: result.value.version } }
            }
            return result
          },
        },
        messages: {
          bodyAriaLabel: ref.label,
          bodyPlaceholder: `Write your ${ref.label}…`,
          saveError: `Couldn't save your ${ref.label}. Try again.`,
        },
      }
  }
}
