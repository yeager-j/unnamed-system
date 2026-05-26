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
import type { IdentityTraitField } from "@/lib/db/character-identity-traits"
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
  const { actions, messages } = wireActions({ characterId, ref })

  // Editable titles (Knives / Chains) carry their own value from the DB;
  // fixed titles (Backstory / Identity Traits) display the canonical
  // section label from the ref. `DocumentEditor` flips the input to
  // read-only when `actions.updateTitle` is undefined, so the styling
  // stays identical either way.
  const displayedTitle = title ?? ref.label

  return (
    <DocumentEditor
      characterId={characterId}
      identityVersion={identityVersion}
      documentId={documentKey(ref)}
      title={displayedTitle}
      body={body}
      actions={actions}
      messages={messages}
    />
  )
}

const UNTITLED_KNIFE = "Untitled Knife"
const UNTITLED_CHAIN = "Untitled Chain"

function documentKey(ref: DocumentRef): string {
  return `${ref.kind}:${ref.id}`
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
          description:
            "Tell us who your character was before the adventure began — what shaped them, what they carry forward, who they used to be. The longer the better; this becomes the table's reference for the years your character has already lived.",
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
          description:
            "An external stake — a person, place, or thing your character cares about. Be specific: not 'my family' but 'my younger sister Mira, who I promised I'd come back to.' Each Knife is a hook the DM can use to threaten you, and a Victory you can earn defending it.",
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
          description:
            "A limitation that binds your character — a debt, an oath, a vice, a wound. Breaking a Chain through play is how you unlock your Paragon, but you won't mark that here — you'll do it from your sheet later.",
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
          description: identityDescriptionFor(ref.id),
          saveError: `Couldn't save your ${ref.label}. Try again.`,
        },
      }
  }
}

function identityDescriptionFor(field: IdentityTraitField): string {
  switch (field) {
    case "personality":
      return "Small, specific habits that make your character recognizable at the table. Use a `- ` list with one trait per line — aim for two to four, concrete enough that the table will pick up on them mid-scene."
    case "hope":
      return "Short-term, realistic goals your character is actively working toward — concrete enough that you and the DM will recognize one being fulfilled. One or two."
    case "dream":
      return "A long-term, larger-than-life goal your character cannot achieve alone — and may not achieve in their lifetime. Choose one."
    case "fear":
      return "Things that paralyze your character now but might be overcome through play. Every Fear emerges from a specific wound — capture both. Often tied to one of your Knives or Chains."
    case "secret":
      return "Things only your character (and perhaps a very small circle) knows, which would be devastating if revealed. Share each with your DM in private."
  }
}
